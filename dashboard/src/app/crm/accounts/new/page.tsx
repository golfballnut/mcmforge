import { NewAccountForm } from './NewAccountForm';

export default function NewAccountPage() {
  return (
    <div className="p-6 max-w-2xl mx-auto">
      <h1 className="text-2xl font-bold text-white mb-4">New account</h1>
      <NewAccountForm />
    </div>
  );
}
