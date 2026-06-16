"use client";

import { useFormStatus } from "react-dom";

function AuthSpinner({ className = "h-6 w-6" }: { className?: string }) {
  return (
    <svg
      className={`animate-spin text-current ${className}`}
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
      aria-hidden
    >
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
      />
    </svg>
  );
}

interface AuthFormFieldsProps {
  children: React.ReactNode;
  className?: string;
}

export function AuthFormFields({ children, className = "" }: AuthFormFieldsProps) {
  const { pending } = useFormStatus();
  return (
    <fieldset
      disabled={pending}
      className={`m-0 min-w-0 border-0 p-0 ${pending ? "opacity-90" : ""} ${className}`}
    >
      {children}
    </fieldset>
  );
}

interface AuthSubmitButtonProps {
  label: string;
  pendingLabel: string;
  variant?: "primary" | "outline";
  className?: string;
}

export function AuthSubmitButton({
  label,
  pendingLabel,
  variant = "primary",
  className = "",
}: AuthSubmitButtonProps) {
  const { pending } = useFormStatus();

  const variantClass =
    variant === "primary"
      ? "bg-orange-500 text-white shadow-lg hover:bg-orange-600"
      : "border border-orange-500 bg-white text-orange-600 shadow-sm hover:bg-orange-50";

  return (
    <button
      type="submit"
      disabled={pending}
      aria-busy={pending}
      className={`w-full rounded-2xl px-6 py-3 text-2xl font-semibold transition disabled:cursor-not-allowed disabled:opacity-80 ${variantClass} ${className}`}
    >
      {pending ? (
        <span className="inline-flex items-center justify-center gap-3">
          <AuthSpinner />
          {pendingLabel}
        </span>
      ) : (
        label
      )}
    </button>
  );
}
