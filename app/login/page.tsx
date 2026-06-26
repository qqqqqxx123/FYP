import { DashboardBackground } from "@/components/dashboard-background";
import { PortalLogo } from "@/components/portal-logo";
import {
  loginAction,
  registerAction,
  verifyLoginOtpAction,
  verifyRegisterOtpAction,
} from "./actions";
import { AuthFormFields, AuthSubmitButton } from "./auth-form-ui";
import { OtpInput } from "./otp-input";
import { PasswordInput } from "./password-input";

interface LoginPageProps {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const params = (await searchParams) ?? {};
  const errorParam = params.error;
  const registerErrorParam = params.registerError;
  const otpErrorParam = params.otpError;
  const otpRequiredParam = params.otpRequired;
  const registerEmailParam = params.registerEmail;
  const registeredParam = params.registered;
  const showRegisterParam = params.showRegister;
  const fromParam = params.from;
  const loginOtpRequiredParam = params.loginOtpRequired;
  const loginEmailParam = params.loginEmail;
  const loginOtpErrorParam = params.loginOtpError;
  const error = Array.isArray(errorParam) ? errorParam[0] : errorParam;
  const registerError = Array.isArray(registerErrorParam) ? registerErrorParam[0] : registerErrorParam;
  const otpError = Array.isArray(otpErrorParam) ? otpErrorParam[0] : otpErrorParam;
  const otpRequired = Array.isArray(otpRequiredParam) ? otpRequiredParam[0] : otpRequiredParam;
  const registerEmail = Array.isArray(registerEmailParam) ? registerEmailParam[0] : registerEmailParam;
  const registered = Array.isArray(registeredParam) ? registeredParam[0] : registeredParam;
  const showRegister = Array.isArray(showRegisterParam) ? showRegisterParam[0] : showRegisterParam;
  const from = Array.isArray(fromParam) ? fromParam[0] : fromParam;
  const loginOtpRequired = Array.isArray(loginOtpRequiredParam) ? loginOtpRequiredParam[0] : loginOtpRequiredParam;
  const loginEmail = Array.isArray(loginEmailParam) ? loginEmailParam[0] : loginEmailParam;
  const loginOtpError = Array.isArray(loginOtpErrorParam) ? loginOtpErrorParam[0] : loginOtpErrorParam;
  const shouldShowOtpForm = otpRequired === "1";
  const shouldShowLoginOtpForm = loginOtpRequired === "1";
  const shouldOpenRegisterModal =
    showRegister === "1" || Boolean(registerError) || Boolean(otpError) || shouldShowOtpForm;

  return (
    <main className="relative flex min-h-screen items-center justify-center px-4 py-8">
      <DashboardBackground />
      <div className="relative z-10 mx-auto w-[95vw] max-w-[31.36rem] rounded-3xl border border-[#f0b26d] bg-white p-6 shadow-[0_12px_30px_rgba(245,122,0,0.12)] sm:p-8">
        <div className="mx-auto flex max-w-[40rem] flex-col items-center text-center">
          <div className="mb-4 flex h-[5.25rem] w-[5.25rem] items-center justify-center rounded-2xl bg-[#faf4eb] p-2">
            <PortalLogo size={72} priority className="h-full w-full" />
          </div>

          <h1 className="text-3xl font-semibold tracking-wide text-slate-900">AI.S.D.S</h1>
          <p className="mt-2 text-xl text-slate-600">AI Scam Detect System</p>
        </div>

        {registered === "1" && (
          <p className="mx-auto mt-8 w-full max-w-[40rem] rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
            Registration successful. You can now sign in.
          </p>
        )}

        {shouldShowLoginOtpForm ? (
          <form action={verifyLoginOtpAction} className="mx-auto mt-8 w-full max-w-[40rem]">
            <AuthFormFields className="space-y-4">
              <input type="hidden" name="loginEmail" value={loginEmail ?? ""} />

              <div>
                <label htmlFor="login-otp" className="mb-2 block text-xl font-medium text-slate-700">
                  6-Digit OTP
                </label>
                <OtpInput id="login-otp" />
              </div>

              {loginOtpError && (
                <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                  {loginOtpError}
                </p>
              )}

              <AuthSubmitButton label="Verify & Sign In" pendingLabel="Verifying…" />

              <a
                href="/login"
                className="block text-center text-lg font-medium text-orange-600 underline-offset-4 transition hover:underline"
              >
                Back to sign in
              </a>
            </AuthFormFields>
          </form>
        ) : (
          <form action={loginAction} className="mx-auto mt-8 w-full max-w-[40rem]">
            <AuthFormFields className="space-y-4">
              <input type="hidden" name="from" value={from?.startsWith("/") ? from : "/dashboard"} />

              <div>
                <label htmlFor="email" className="mb-2 block text-xl font-medium text-slate-700">
                  Email
                </label>
                <input
                  id="email"
                  name="email"
                  type="email"
                  required
                  inputMode="email"
                  autoComplete="email"
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck={false}
                  placeholder="your-email@domain.com"
                  className="w-full rounded-2xl border border-slate-300 px-4 py-3 text-xl lowercase text-slate-800 outline-none transition focus:border-orange-400 focus:ring-2 focus:ring-orange-100"
                />
              </div>

              <div>
                <label htmlFor="password" className="mb-2 block text-xl font-medium text-slate-700">
                  Password
                </label>
                <PasswordInput
                  id="password"
                  name="password"
                  autoComplete="current-password"
                  placeholder="Enter your password"
                  required
                />
              </div>

              {error && (
                <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                  {error}
                </p>
              )}

              <AuthSubmitButton label="Sign In" pendingLabel="Signing in…" />

              <a
                href="/login?showRegister=1"
                className="block text-center text-lg font-medium text-orange-600 underline-offset-4 transition hover:underline"
              >
                Register now
              </a>
            </AuthFormFields>
          </form>
        )}
      </div>

      {shouldOpenRegisterModal && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 px-4 py-8">
          <div className="w-full max-w-[31.36rem] rounded-3xl border border-[#f0b26d] bg-white p-6 shadow-[0_12px_30px_rgba(245,122,0,0.2)] sm:p-8">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-2xl font-semibold text-slate-900">Register</h2>
              <a
                href="/login"
                className="rounded-xl border border-slate-300 px-3 py-1 text-sm font-medium text-slate-600 transition hover:bg-slate-50"
              >
                Close
              </a>
            </div>

            {shouldShowOtpForm ? (
              <form action={verifyRegisterOtpAction}>
                <AuthFormFields className="space-y-4">
                  <input type="hidden" name="registerEmail" value={registerEmail ?? ""} />

                  <div>
                    <label htmlFor="register-otp" className="mb-2 block text-xl font-medium text-slate-700">
                      6-Digit OTP
                    </label>
                    <OtpInput id="register-otp" />
                  </div>

                  {otpError && (
                    <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                      {otpError}
                    </p>
                  )}

                  <AuthSubmitButton
                    label="Verify OTP"
                    pendingLabel="Verifying…"
                    variant="outline"
                  />
                </AuthFormFields>
              </form>
            ) : (
              <form action={registerAction}>
                <AuthFormFields className="space-y-4">
                  <div>
                    <label htmlFor="register-email" className="mb-2 block text-xl font-medium text-slate-700">
                      Gmail
                    </label>
                    <input
                      id="register-email"
                      name="email"
                      type="email"
                      required
                      inputMode="email"
                      autoComplete="email"
                      autoCapitalize="none"
                      autoCorrect="off"
                      spellCheck={false}
                      placeholder="your-email@gmail.com"
                      className="w-full rounded-2xl border border-slate-300 px-4 py-3 text-xl lowercase text-slate-800 outline-none transition focus:border-orange-400 focus:ring-2 focus:ring-orange-100"
                    />
                  </div>

                  <div>
                    <label htmlFor="register-password" className="mb-2 block text-xl font-medium text-slate-700">
                      Password
                    </label>
                    <PasswordInput
                      id="register-password"
                      name="password"
                      autoComplete="new-password"
                      placeholder="At least 8 chars with letters, numbers, symbols"
                      required
                    />
                  </div>

                  <div>
                    <label
                      htmlFor="register-confirm-password"
                      className="mb-2 block text-xl font-medium text-slate-700"
                    >
                      Re-enter Password
                    </label>
                    <PasswordInput
                      id="register-confirm-password"
                      name="confirmPassword"
                      autoComplete="new-password"
                      placeholder="Re-enter your password"
                      required
                    />
                  </div>

                  {registerError && (
                    <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                      {registerError}
                    </p>
                  )}

                  <AuthSubmitButton
                    label="Register"
                    pendingLabel="Registering…"
                    variant="outline"
                  />
                </AuthFormFields>
              </form>
            )}
          </div>
        </div>
      )}
    </main>
  );
}
