import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

// Telegram webhook handler for MCM Forge task intake
// Steve sends a message (+ optional screenshot) to the bot
// and it auto-creates a task in task_queue

const ALLOWED_CHAT_IDS = (Deno.env.get("TELEGRAM_ALLOWED_CHAT_IDS") || "").split(",").filter(Boolean);

interface TelegramUpdate {
  message?: {
    chat: { id: number };
    from?: { first_name?: string; username?: string };
    text?: string;
    caption?: string;
    photo?: Array<{ file_id: string; width: number; height: number }>;
  };
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") {
    return new Response("OK", { status: 200 });
  }

  try {
    const update: TelegramUpdate = await req.json();
    const message = update.message;

    if (!message) {
      return new Response("OK", { status: 200 });
    }

    const chatId = message.chat.id.toString();
    const botToken = Deno.env.get("TELEGRAM_BOT_TOKEN")!;

    // Only allow configured chat IDs (Steve's chat)
    if (ALLOWED_CHAT_IDS.length > 0 && !ALLOWED_CHAT_IDS.includes(chatId)) {
      await sendTelegram(botToken, chatId, "Unauthorized. Contact the MCM Forge admin.");
      return new Response("OK", { status: 200 });
    }

    const text = message.text || message.caption || "";

    // Parse the message: first line = title, rest = description
    const lines = text.trim().split("\n");
    const title = lines[0]?.trim();
    const description = lines.slice(1).join("\n").trim();

    if (!title) {
      await sendTelegram(botToken, chatId, "Send a message with a task title (first line) and optional description (remaining lines).");
      return new Response("OK", { status: 200 });
    }

    // Parse task type from hashtag if present: #research, #code, #content, #ops
    const typeMatch = text.match(/#(code|research|content|ops|chat)/i);
    const taskType = typeMatch ? typeMatch[1].toLowerCase() : "code";

    // Parse priority from hashtag: #critical, #high, #low
    const priorityMatch = text.match(/#(critical|high|medium|low)/i);
    const priority = priorityMatch ? priorityMatch[1].toLowerCase() : "medium";

    // Handle screenshot upload if present
    let screenshotUrl: string | null = null;
    if (message.photo && message.photo.length > 0) {
      // Get largest photo
      const photo = message.photo[message.photo.length - 1];
      try {
        // Get file path from Telegram
        const fileRes = await fetch(
          `https://api.telegram.org/bot${botToken}/getFile?file_id=${photo.file_id}`
        );
        const fileData = await fileRes.json();
        const filePath = fileData.result?.file_path;

        if (filePath) {
          // Download the file
          const downloadRes = await fetch(
            `https://api.telegram.org/file/bot${botToken}/${filePath}`
          );
          const fileBytes = await downloadRes.arrayBuffer();

          // Upload to Supabase Storage
          const supabase = createClient(
            Deno.env.get("SUPABASE_URL")!,
            Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
          );

          const fileName = `telegram-${Date.now()}.jpg`;
          const { error: uploadError } = await supabase.storage
            .from("artifacts")
            .upload(fileName, fileBytes, {
              contentType: "image/jpeg",
              upsert: true,
            });

          if (!uploadError) {
            const { data: urlData } = supabase.storage
              .from("artifacts")
              .getPublicUrl(fileName);
            screenshotUrl = urlData.publicUrl;
          }
        }
      } catch (err) {
        console.error("Screenshot upload failed:", err);
      }
    }

    // Create task in brain DB
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Look up DirtSync company_id (default for now)
    const { data: company } = await supabase
      .from("company_registry")
      .select("id")
      .eq("slug", "dirtsync")
      .single();

    const fullDescription = [
      description,
      screenshotUrl ? `\nScreenshot: ${screenshotUrl}` : "",
    ]
      .filter(Boolean)
      .join("\n");

    const { data: task, error: insertError } = await supabase
      .from("task_queue")
      .insert({
        title: title.replace(/#\w+/g, "").trim(),
        description: fullDescription || null,
        company_id: company?.id || null,
        priority,
        task_type: taskType,
        cli_target: "claude",
        status: "todo",
        assigned_to: "agent-executor",
        created_by: "telegram",
      })
      .select("id")
      .single();

    if (insertError) {
      await sendTelegram(botToken, chatId, `Failed to create task: ${insertError.message}`);
      return new Response("OK", { status: 200 });
    }

    const confirmMsg = [
      `Task created: ${title.replace(/#\w+/g, "").trim()}`,
      `Type: ${taskType} | Priority: ${priority}`,
      screenshotUrl ? "Screenshot attached" : "",
      `ID: ${task.id.slice(0, 8)}`,
    ]
      .filter(Boolean)
      .join("\n");

    await sendTelegram(botToken, chatId, confirmMsg);
    return new Response("OK", { status: 200 });
  } catch (err) {
    console.error("Webhook error:", err);
    return new Response("OK", { status: 200 });
  }
});

async function sendTelegram(token: string, chatId: string, text: string) {
  await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text }),
  });
}
