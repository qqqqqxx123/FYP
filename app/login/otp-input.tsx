"use client";

interface OtpInputProps {
  id: string;
  name?: string;
}

export function OtpInput({ id, name = "otp" }: OtpInputProps) {
  function sanitize(value: string): string {
    return value.replace(/\D/g, "").slice(0, 6);
  }

  function handleInput(event: React.FormEvent<HTMLInputElement>) {
    const input = event.currentTarget;
    const next = sanitize(input.value);
    if (input.value !== next) input.value = next;
  }

  function handlePaste(event: React.ClipboardEvent<HTMLInputElement>) {
    event.preventDefault();
    const input = event.currentTarget;
    input.value = sanitize(event.clipboardData.getData("text"));
  }

  return (
    <input
      id={id}
      name={name}
      type="text"
      required
      inputMode="numeric"
      pattern="\d{6}"
      maxLength={6}
      minLength={6}
      autoComplete="off"
      autoCorrect="off"
      autoCapitalize="off"
      spellCheck={false}
      data-lpignore="true"
      data-1p-ignore
      readOnly
      onFocus={(event) => event.currentTarget.removeAttribute("readonly")}
      onInput={handleInput}
      onPaste={handlePaste}
      placeholder=""
      className="w-full rounded-2xl border border-slate-300 px-4 py-4 text-center text-3xl leading-none tracking-[0.3em] text-slate-800 outline-none transition focus:border-orange-400 focus:ring-2 focus:ring-orange-100"
    />
  );
}
