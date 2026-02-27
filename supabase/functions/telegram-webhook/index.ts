import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

// Interactive Telegram webhook for MCM Forge task intake
// Flow: Steve sends message → bot shows inline keyboard form → Steve taps to configure → Submit creates task
// Power-user mode: if all fields are tagged ([company] #type #priority #cli), task goes straight in

const ALLOWED_CHAT_IDS = (
  Deno.env.get("TELEGRAM_ALLOWED_CHAT_IDS") || ""
)
  .split(",")
  .filter(Boolean);

// ── Types ──────────────────────────────────────────────

interface TelegramUpdate {
  message?: TelegramMessage;
  callback_query?: TelegramCallbackQuery;
}

interface TelegramMessage {
  chat: { id: number };
  from?: { first_name?: string; username?: string };
  text?: string;
  caption?: string;
  message_id?: number;
  photo?: Array<{ file_id: string; width: number; height: number }>;
}

interface TelegramCallbackQuery {
  id: string;
  from: { first_name?: string; username?: string };
  message: { message_id: number; chat: { id: number } };
  data: string;
}

interface InlineButton {
  text: string;
  callback_data: string;
}

// ── Constants ──────────────────────────────────────────

const COMPANIES = [
  { slug: "dirtsync", label: "DirtSync" },
  { slug: "mcmforge", label: "MCM Forge" },
  { slug: "linkschoice", label: "Links Choice" },
  { slug: "golfballnut", label: "GBN" },
  { slug: "hotgolfbrands", label: "HGB" },
  { slug: "fiftyfirstsessions", label: "FFS" },
];

const PRIORITIES = [
  { value: "critical", label: "Critical" },
  { value: "high", label: "High" },
  { value: "medium", label: "Medium" },
  { value: "low", label: "Low" },
];

const TASK_TYPES = [
  { value: "code", label: "Code" },
  { value: "research", label: "Research" },
  { value: "content", label: "Content" },
  { value: "ops", label: "Ops" },
  { value: "spec", label: "Spec" },
];

const CLI_TARGETS = [
  { value: "claude", label: "Claude" },
  { value: "gemini", label: "Gemini" },
  { value: "codex", label: "Codex" },
];

// ── Helpers ────────────────────────────────────────────

function getSupabase() {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );
}

async function sendTelegram(token: string, chatId: string, text: string) {
  await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text, parse_mode: "HTML" }),
  });
}

async function sendTelegramWithKeyboard(
  token: string,
  chatId: string,
  text: string,
  keyboard: InlineButton[][]
) {
  await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      parse_mode: "HTML",
      reply_markup: { inline_keyboard: keyboard },
    }),
  });
}

async function editTelegramMessage(
  token: string,
  chatId: string,
  messageId: number,
  text: string,
  keyboard: InlineButton[][] | null = null
) {
  const body: Record<string, unknown> = {
    chat_id: chatId,
    message_id: messageId,
    text,
    parse_mode: "HTML",
  };
  if (keyboard) {
    body.reply_markup = { inline_keyboard: keyboard };
  } else {
    body.reply_markup = { inline_keyboard: [] };
  }
  await fetch(`https://api.telegram.org/bot${token}/editMessageText`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

async function answerCallback(token: string, callbackId: string) {
  await fetch(`https://api.telegram.org/bot${token}/answerCallbackQuery`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ callback_query_id: callbackId }),
  });
}

async function uploadScreenshot(
  photos: Array<{ file_id: string }>,
  botToken: string
): Promise<string | null> {
  const photo = photos[photos.length - 1];
  try {
    const fileRes = await fetch(
      `https://api.telegram.org/bot${botToken}/getFile?file_id=${photo.file_id}`
    );
    const fileData = await fileRes.json();
    const filePath = fileData.result?.file_path;
    if (!filePath) return null;

    const downloadRes = await fetch(
      `https://api.telegram.org/file/bot${botToken}/${filePath}`
    );
    const fileBytes = await downloadRes.arrayBuffer();

    const supabase = getSupabase();
    const fileName = `telegram-${Date.now()}.jpg`;
    const { error } = await supabase.storage
      .from("artifacts")
      .upload(fileName, fileBytes, { contentType: "image/jpeg", upsert: true });

    if (error) return null;

    const { data: urlData } = supabase.storage
      .from("artifacts")
      .getPublicUrl(fileName);
    return urlData.publicUrl;
  } catch {
    return null;
  }
}

// ── Smart Detection ────────────────────────────────────

function detectCompany(text: string): string {
  const lower = text.toLowerCase();
  const signals: Record<string, string[]> = {
    dirtsync: ["dirtsync", "dirt sync", "trail", "map", "atv", "ohv", "riding"],
    linkschoice: ["links choice", "linkschoice", "recycled golf", "plant"],
    golfballnut: ["golf ball nut", "golfballnut", "gbn", "shipstation"],
    hotgolfbrands: ["hot golf", "hotgolf", "hgb", "mesh bag", "bulk bag"],
    fiftyfirstsessions: ["fifty first", "fiftyfirst", "ffs", "51st"],
  };
  for (const [slug, keywords] of Object.entries(signals)) {
    if (keywords.some((kw) => lower.includes(kw))) return slug;
  }
  return "mcmforge";
}

function classifyTaskType(text: string): string {
  const lower = text.toLowerCase();
  const codeSignals = [
    /\b(fix|build|implement|deploy|add feature|refactor|migrate|upgrade|update code|patch|hotfix)\b/,
    /\b(create component|add endpoint|write test|set up|install|configure)\b/,
    /\b(bug|broken|crash|error|failing|not working)\b/,
  ];
  const researchSignals = [
    /\b(research|analyze|compare|investigate|audit|study|evaluate|assess)\b/,
    /\b(competitor|market|trend|opportunity|strategy|landscape|benchmark)\b/,
    /\b(deep dive|pros and cons|feasibility|report|findings|intelligence)\b/,
    /\b(why|how does|what if|should we|explore)\b/,
  ];
  const contentSignals = [
    /\b(write|blog|seo|marketing|email campaign|social media|copy|content)\b/,
    /\b(landing page copy|newsletter|announcement|press release)\b/,
  ];
  const opsSignals = [
    /\b(check status|health check|restart|monitor|scale|backup|clean up)\b/,
    /\b(cron|pm2|server|uptime|disk space|memory usage)\b/,
  ];
  const score = (patterns: RegExp[]) =>
    patterns.filter((p) => p.test(lower)).length;
  const scores = {
    code: score(codeSignals),
    research: score(researchSignals),
    content: score(contentSignals),
    ops: score(opsSignals),
  };
  const best = Object.entries(scores).sort((a, b) => b[1] - a[1])[0];
  return best[1] > 0 ? best[0] : "research";
}

// ── Keyboard Builder ───────────────────────────────────

function buildKeyboard(
  draftId: string,
  companySlug: string,
  priority: string,
  taskType: string,
  cliTarget: string
): InlineButton[][] {
  const kb: InlineButton[][] = [];

  // Company rows (3 per row)
  kb.push(
    COMPANIES.slice(0, 3).map((c) => ({
      text: c.slug === companySlug ? `\u2713 ${c.label}` : c.label,
      callback_data: `c:${c.slug}:${draftId}`,
    }))
  );
  kb.push(
    COMPANIES.slice(3).map((c) => ({
      text: c.slug === companySlug ? `\u2713 ${c.label}` : c.label,
      callback_data: `c:${c.slug}:${draftId}`,
    }))
  );

  // Priority row
  kb.push(
    PRIORITIES.map((p) => ({
      text: p.value === priority ? `\u2713 ${p.label}` : p.label,
      callback_data: `p:${p.value}:${draftId}`,
    }))
  );

  // Type row
  kb.push(
    TASK_TYPES.map((t) => ({
      text: t.value === taskType ? `\u2713 ${t.label}` : t.label,
      callback_data: `t:${t.value}:${draftId}`,
    }))
  );

  // CLI row
  kb.push(
    CLI_TARGETS.map((l) => ({
      text: l.value === cliTarget ? `\u2713 ${l.label}` : l.label,
      callback_data: `l:${l.value}:${draftId}`,
    }))
  );

  // Submit / Cancel
  kb.push([
    { text: "\u2705 Submit", callback_data: `ok:${draftId}` },
    { text: "\u274c Cancel", callback_data: `xx:${draftId}` },
  ]);

  return kb;
}

function buildDraftMessage(title: string): string {
  return [
    `\ud83d\udccb <b>New Task</b>`,
    ``,
    `"${title}"`,
    ``,
    `Tap to configure, then Submit:`,
    `\ud83d\udccd Company \u2022 \u26a1 Priority \u2022 \ud83d\udd27 Type \u2022 \ud83e\udd16 CLI`,
  ].join("\n");
}

// ── Message Handler ────────────────────────────────────

async function handleMessage(message: TelegramMessage) {
  const chatId = message.chat.id.toString();
  const botToken = Deno.env.get("TELEGRAM_BOT_TOKEN")!;

  if (ALLOWED_CHAT_IDS.length > 0 && !ALLOWED_CHAT_IDS.includes(chatId)) {
    await sendTelegram(botToken, chatId, "Unauthorized.");
    return;
  }

  const text = message.text || message.caption || "";
  const lines = text.trim().split("\n");
  const title = lines[0]?.trim();
  const description = lines.slice(1).join("\n").trim();

  if (!title) {
    await sendTelegram(
      botToken,
      chatId,
      "Send a task and I'll help you route it.\n\nPower-user: <code>[dirtsync] #code #high #claude fix the zoom</code>"
    );
    return;
  }

  // Parse explicit tags
  const companyMatch = text.match(/\[(\w+)\]/i);
  const typeMatch = text.match(/#(code|research|content|ops|chat|spec)/i);
  const priorityMatch = text.match(/#(critical|high|medium|low)/i);
  const cliMatch = text.match(/#(claude|gemini|codex)/i);

  // Auto-detect from content
  const detectedCompany = companyMatch
    ? companyMatch[1].toLowerCase()
    : detectCompany(text);
  const detectedType = typeMatch
    ? typeMatch[1].toLowerCase()
    : classifyTaskType(text);
  const detectedPriority = priorityMatch
    ? priorityMatch[1].toLowerCase()
    : "medium";
  const detectedCli = cliMatch ? cliMatch[1].toLowerCase() : "claude";

  // Clean title (strip tags)
  const cleanTitle = title
    .replace(/\[\w+\]/g, "")
    .replace(/#\w+/g, "")
    .trim();

  // Handle screenshot
  let screenshotUrl: string | null = null;
  if (message.photo && message.photo.length > 0) {
    screenshotUrl = await uploadScreenshot(message.photo, botToken);
  }

  const fullDescription = [
    description,
    screenshotUrl ? `\nScreenshot: ${screenshotUrl}` : "",
  ]
    .filter(Boolean)
    .join("\n");

  const supabase = getSupabase();

  // Look up company
  const { data: company } = await supabase
    .from("company_registry")
    .select("id, name, slug")
    .eq("slug", detectedCompany)
    .single();

  // Power-user mode: all 4 tags explicit → skip the form
  const allExplicit = companyMatch && typeMatch && priorityMatch && cliMatch;

  if (allExplicit && company) {
    const { data: task, error } = await supabase
      .from("task_queue")
      .insert({
        title: cleanTitle,
        description: fullDescription || null,
        company_id: company.id,
        priority: detectedPriority,
        task_type: detectedType,
        cli_target: detectedCli,
        status: "todo",
        assigned_to: "agent-executor",
        created_by: "telegram",
      })
      .select("id")
      .single();

    if (error) {
      await sendTelegram(botToken, chatId, `Failed: ${error.message}`);
      return;
    }

    await sendTelegram(
      botToken,
      chatId,
      [
        `\u2705 <b>Task created</b>`,
        ``,
        `"${cleanTitle}"`,
        `${company.name} \u2022 ${detectedType} \u2022 ${detectedCli} \u2022 ${detectedPriority}`,
        `ID: <code>${task.id.slice(0, 8)}</code>`,
      ].join("\n")
    );
    return;
  }

  // Interactive mode: cancel old drafts, create new one

  // Cancel any existing drafts for this chat
  await supabase
    .from("task_queue")
    .delete()
    .eq("status", "draft")
    .like("created_by", `telegram-${chatId}%`);

  // Resolve company (fall back to mcmforge)
  let companyId = company?.id;
  let companySlug = company?.slug || "mcmforge";
  if (!companyId) {
    const { data: mf } = await supabase
      .from("company_registry")
      .select("id, slug")
      .eq("slug", "mcmforge")
      .single();
    companyId = mf?.id;
    companySlug = "mcmforge";
  }

  const { data: draft, error: draftError } = await supabase
    .from("task_queue")
    .insert({
      title: cleanTitle,
      description: fullDescription || null,
      company_id: companyId,
      priority: detectedPriority,
      task_type: detectedType,
      cli_target: detectedCli,
      status: "draft",
      assigned_to: "agent-executor",
      created_by: `telegram-${chatId}`,
    })
    .select("id")
    .single();

  if (draftError || !draft) {
    await sendTelegram(
      botToken,
      chatId,
      `Error: ${draftError?.message || "Unknown"}`
    );
    return;
  }

  const draftId = draft.id.slice(0, 8);
  const msgText = buildDraftMessage(cleanTitle);
  const keyboard = buildKeyboard(
    draftId,
    companySlug,
    detectedPriority,
    detectedType,
    detectedCli
  );

  await sendTelegramWithKeyboard(botToken, chatId, msgText, keyboard);
}

// ── Callback Handler ───────────────────────────────────

async function handleCallback(callback: TelegramCallbackQuery) {
  const botToken = Deno.env.get("TELEGRAM_BOT_TOKEN")!;
  const chatId = callback.message.chat.id.toString();
  const messageId = callback.message.message_id;
  const data = callback.data;

  // Dismiss the loading spinner
  await answerCallback(botToken, callback.id);

  const parts = data.split(":");
  if (parts.length < 2) return;

  const supabase = getSupabase();

  // ── Spec Approve ──
  if (parts[0] === "sa") {
    const specSheetId = parts[1];
    await supabase
      .from("spec_sheets")
      .update({
        approval_status: "approved",
        approved_by: "steve",
        approved_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", specSheetId);

    // Create builder task (look up spec sheet for task info)
    const { data: spec } = await supabase
      .from("spec_sheets")
      .select("*, task_queue!spec_sheets_task_id_fkey(title, description, company_id)")
      .eq("id", specSheetId)
      .single();

    if (spec?.task_queue) {
      const reqStr = (spec.requirements || [])
        .map((r: { priority: string; description: string }) => `- [${r.priority}] ${r.description}`)
        .join("\n");
      const criteriaStr = (spec.acceptance_criteria || [])
        .map((c: { type: string; description: string }) => `- [${c.type}] ${c.description}`)
        .join("\n");
      const designStr = Object.keys(spec.design_tokens || {}).length > 0
        ? `\n\nDesign Tokens:\n${JSON.stringify(spec.design_tokens, null, 2)}`
        : "";

      const builderDesc = `SPEC-DRIVEN TASK — implement ALL requirements exactly.\n\nMockup: ${spec.mockup_url}\n\nRequirements:\n${reqStr}\n\nAcceptance Criteria:\n${criteriaStr}${designStr}\n\nThe task CANNOT close until score = 100%.`;

      const { data: builderTask } = await supabase
        .from("task_queue")
        .insert({
          title: `[BUILD] ${spec.title}`,
          description: builderDesc,
          task_type: "code",
          cli_target: "claude",
          company_id: spec.company_id || spec.task_queue.company_id,
          priority: "high",
          status: "todo",
          spec_sheet_id: specSheetId,
          parent_task_id: spec.task_id,
          created_by: "spec-pipeline",
        })
        .select("id")
        .single();

      if (builderTask) {
        await supabase
          .from("spec_sheets")
          .update({ builder_task_id: builderTask.id })
          .eq("id", specSheetId);
      }
    }

    await editTelegramMessage(
      botToken, chatId, messageId,
      `\u2705 <b>Spec Approved!</b>\n\nBuilder task created. Agent will start coding to spec.`
    );
    return;
  }

  // ── Spec Reject ──
  if (parts[0] === "sr") {
    const specSheetId = parts[1];
    await supabase
      .from("spec_sheets")
      .update({
        approval_status: "rejected",
        updated_at: new Date().toISOString(),
      })
      .eq("id", specSheetId);

    // Mark parent task as blocked
    const { data: spec } = await supabase
      .from("spec_sheets")
      .select("task_id")
      .eq("id", specSheetId)
      .single();

    if (spec?.task_id) {
      await supabase
        .from("task_queue")
        .update({ status: "blocked", result_summary: "Spec rejected by Steve" })
        .eq("id", spec.task_id);
    }

    await editTelegramMessage(
      botToken, chatId, messageId,
      `\u274c <b>Spec Rejected.</b>\n\nTask blocked.`
    );
    return;
  }

  // ── Spec Revision ──
  if (parts[0] === "sv") {
    const specSheetId = parts[1];
    await supabase
      .from("spec_sheets")
      .update({
        approval_status: "revision_needed",
        updated_at: new Date().toISOString(),
      })
      .eq("id", specSheetId);

    await editTelegramMessage(
      botToken, chatId, messageId,
      `\u270f\ufe0f <b>Revision requested.</b>\n\nReply with your notes and the spec will be updated.`
    );
    return;
  }

  // ── Submit ──
  if (parts[0] === "ok") {
    const draftId = parts[1];
    const { data: drafts } = await supabase
      .from("task_queue")
      .select("id, title, company_id, priority, task_type, cli_target")
      .eq("status", "draft")
      .like("id", `${draftId}%`)
      .limit(1);

    const draft = drafts?.[0];
    if (!draft) {
      await editTelegramMessage(
        botToken,
        chatId,
        messageId,
        "\u26a0\ufe0f Draft expired or already submitted."
      );
      return;
    }

    await supabase
      .from("task_queue")
      .update({ status: "todo", created_by: "telegram" })
      .eq("id", draft.id);

    const { data: company } = await supabase
      .from("company_registry")
      .select("name")
      .eq("id", draft.company_id)
      .single();

    await editTelegramMessage(
      botToken,
      chatId,
      messageId,
      [
        `\u2705 <b>Task submitted</b>`,
        ``,
        `"${draft.title}"`,
        `${company?.name || "?"} \u2022 ${draft.task_type} \u2022 ${draft.cli_target} \u2022 ${draft.priority}`,
        `ID: <code>${draft.id.slice(0, 8)}</code>`,
        ``,
        `Dispatcher picks this up within 5 min.`,
      ].join("\n")
    );
    return;
  }

  // ── Cancel ──
  if (parts[0] === "xx") {
    const draftId = parts[1];
    await supabase
      .from("task_queue")
      .delete()
      .eq("status", "draft")
      .like("id", `${draftId}%`);

    await editTelegramMessage(
      botToken,
      chatId,
      messageId,
      "\u274c Task cancelled."
    );
    return;
  }

  // ── Field update: "field:value:draftId" ──
  if (parts.length < 3) return;
  const [field, value, draftId] = parts;

  const { data: drafts } = await supabase
    .from("task_queue")
    .select("id, title, priority, task_type, cli_target, company_id")
    .eq("status", "draft")
    .like("id", `${draftId}%`)
    .limit(1);

  const draft = drafts?.[0];
  if (!draft) {
    await editTelegramMessage(
      botToken,
      chatId,
      messageId,
      "\u26a0\ufe0f Draft expired. Send your task again."
    );
    return;
  }

  // Apply the update
  const updateData: Record<string, string> = {};
  let newCompanySlug: string | undefined;

  if (field === "c") {
    const { data: comp } = await supabase
      .from("company_registry")
      .select("id, slug")
      .eq("slug", value)
      .single();
    if (comp) {
      updateData.company_id = comp.id;
      newCompanySlug = comp.slug;
    }
  } else if (field === "p") {
    updateData.priority = value;
  } else if (field === "t") {
    updateData.task_type = value;
  } else if (field === "l") {
    updateData.cli_target = value;
  }

  if (Object.keys(updateData).length > 0) {
    await supabase.from("task_queue").update(updateData).eq("id", draft.id);
  }

  // Determine current state
  const currentPriority = updateData.priority || draft.priority;
  const currentType = updateData.task_type || draft.task_type;
  const currentCli = updateData.cli_target || draft.cli_target;

  let currentCompanySlug = newCompanySlug;
  if (!currentCompanySlug) {
    const cId = updateData.company_id || draft.company_id;
    const { data: comp } = await supabase
      .from("company_registry")
      .select("slug")
      .eq("id", cId)
      .single();
    currentCompanySlug = comp?.slug || "mcmforge";
  }

  // Rebuild keyboard with updated selections
  const keyboard = buildKeyboard(
    draftId,
    currentCompanySlug,
    currentPriority,
    currentType,
    currentCli
  );
  const msgText = buildDraftMessage(draft.title);

  await editTelegramMessage(botToken, chatId, messageId, msgText, keyboard);
}

// ── Main Handler ───────────────────────────────────────

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return new Response("OK", { status: 200 });

  try {
    const update: TelegramUpdate = await req.json();

    if (update.callback_query) {
      await handleCallback(update.callback_query);
      return new Response("OK", { status: 200 });
    }

    if (update.message) {
      await handleMessage(update.message);
      return new Response("OK", { status: 200 });
    }

    return new Response("OK", { status: 200 });
  } catch (err) {
    console.error("Webhook error:", err);
    return new Response("OK", { status: 200 });
  }
});
