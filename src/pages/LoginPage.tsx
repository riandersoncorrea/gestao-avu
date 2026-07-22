import { useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import {
  Link,
  useLocation,
  useNavigate,
  type Location,
} from "react-router-dom";
import { z } from "zod";
import { Button } from "@/components/Button";
import { Input } from "@/components/Input";
import { signIn } from "@/features/auth/authService";
import { ROUTES } from "@/lib/routes";
import saoLuisEfcLogo from "@/assets/branding/sao-luis-efc-logo.png";
  
const loginSchema = z.object({
  email: z.string().min(1, "Informe seu e-mail").email("E-mail inválido"),
  password: z.string().min(1, "Informe sua senha"),
});

type LoginFormValues = z.infer<typeof loginSchema>;

interface LocationState {
  from?: Location;
}

export function LoginPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const [formError, setFormError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginFormValues>({ resolver: zodResolver(loginSchema) });

  const onSubmit = handleSubmit(async (values) => {
    setFormError(null);
    try {
      await signIn(values.email, values.password);
      const state = location.state as LocationState | null;
      navigate(state?.from?.pathname ?? ROUTES.dashboard, { replace: true });
    } catch (error) {
      setFormError(
        error instanceof Error
          ? mapAuthError(error.message)
          : "Não foi possível entrar. Tente novamente.",
      );
    }
  });

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-gray-50 p-4">
      <div
        className="pointer-events-none absolute -left-10 top-10 size-40 rounded-2xl bg-mint-300/60"
        aria-hidden
      />
      <div
        className="pointer-events-none absolute right-16 top-24 size-24 rounded-2xl border-2 border-gold-400"
        aria-hidden
      />
      <div
        className="pointer-events-none absolute -right-6 bottom-32 size-28 rounded-2xl bg-gold-400/70"
        aria-hidden
      />
      <div
        className="pointer-events-none absolute bottom-0 left-0 h-24 w-full bg-primary-600/95"
        aria-hidden
      />

      <div className="relative z-10 w-full max-w-md rounded-2xl border border-gray-200 bg-white p-8 shadow-xl">
        <div className="flex justify-center">
          <img
            src={saoLuisEfcLogo}
            alt="Serviços Operacionais São Luís EFC"
            className="h-16 w-auto"
          />
        </div>

        <h1 className="mt-6 text-center text-lg font-semibold text-graphite-800">
          Gestão de AVU
        </h1>
        <p className="mt-1 text-center text-sm text-gray-500">
          Serviços Operacionais São Luís EFC
        </p>

        <form onSubmit={onSubmit} className="mt-6 flex flex-col gap-4">
          {formError && (
            <p
              role="alert"
              className="rounded-xl bg-magenta-50 px-3 py-2 text-sm text-magenta-700"
            >
              {formError}
            </p>
          )}
          <Input
            label="E-mail"
            type="email"
            autoComplete="email"
            error={errors.email?.message}
            {...register("email")}
          />
          <Input
            label="Senha"
            type="password"
            autoComplete="current-password"
            error={errors.password?.message}
            {...register("password")}
          />
          <div className="-mt-1 text-right">
            <Link
              to={ROUTES.forgotPassword}
              className="text-xs font-medium text-primary-700 hover:underline"
            >
              Esqueci minha senha
            </Link>
          </div>
          <Button
            type="submit"
            isLoading={isSubmitting}
            className="mt-2 w-full"
          >
            Entrar
          </Button>
        </form>

        <p className="mt-6 text-center text-xs text-gray-500">
          Tem um convite?{" "}
          <Link
            to={ROUTES.signup}
            className="font-medium text-primary-700 hover:underline"
          >
            Criar conta
          </Link>
        </p>
      </div>

      {/* <img
        src={valeLogoPlaceholder}
        alt="Vale"
        className="absolute bottom-6 right-6 z-10 h-8 w-auto"
      /> */}
    </div>
  );
}

function mapAuthError(message: string): string {
  if (message.includes("Invalid login credentials"))
    return "E-mail ou senha incorretos.";
  if (message.includes("Email not confirmed"))
    return "Confirme seu e-mail antes de entrar.";
  return message;
}
