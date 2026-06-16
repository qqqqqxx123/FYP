import { CustomerManager } from "../customer-manager";

export default function CustomersPage() {
  return (
    <div className="space-y-8">
      <header>
        <h1 className="text-2xl font-semibold text-slate-900">
          Customer Management
        </h1>
      </header>
      <CustomerManager />
    </div>
  );
}
