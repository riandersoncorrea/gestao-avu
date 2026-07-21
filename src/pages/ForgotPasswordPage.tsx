import { useState } from 'react'
import { zodResolver } from '@hookform/resolvers/zod'
import { useForm } from 'react-hook-form'
import { Link } from 'react-router-dom'
import { z } from 'zod'
import { MailCheck } from 'lucide-react'
import { Button } from '@/components/Button'
import { Input } from '@/components/Input'
import { requestPasswordReset } from '@/features/auth/authService'
import { ROUTES } from '@/lib/routes'
import saoLuisEfcLogo from '@/assets/branding/sao-luis-efc-logo.png'

const forgotPasswordSchema = z.object({
  email: z.string().min(1, 'Informe seu e-mail').email('E-mail inválido'),
})

type ForgotPasswordFormValues = z.infer<typeof forgotPasswordSchema>

export function ForgotPasswordPage() {
  const [isDone, setIsDone] = useState(false)
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ForgotPasswordFormValues>({ resolver: zodResolver(forgotPasswordSchema) })

  const onSubmit = handleSubmit(async (values) => {
    // Não revelamos se o e-mail existe ou não — mesma mensagem em qualquer caso.
    await requestPasswordReset(values.email).catch(() => undefined)
    setIsDone(true)
  })

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 p-4">
      <div className="w-full max-w-md rounded-2xl border border-gray-200 bg-white p-8 shadow-xl">
        <div className="flex justify-center">
          <img src={saoLuisEfcLogo} alt="Serviços Operacionais São Luís EFC" className="h-16 w-auto" />
        </div>

        <h1 className="mt-6 text-center text-lg font-semibold text-graphite-800">Esqueci minha senha</h1>
        <p className="mt-1 text-center text-sm text-gray-500">
          Enviaremos um link de redefinição para o seu e-mail.
        </p>

        {isDone ? (
          <div className="mt-6 flex flex-col items-center gap-3 rounded-xl bg-secondary-50 p-4 text-center">
            <MailCheck className="size-8 text-secondary-600" />
            <p className="text-sm text-graphite-700">
              Se o e-mail informado estiver cadastrado, você receberá um link para redefinir sua senha.
            </p>
          </div>
        ) : (
          <form onSubmit={onSubmit} className="mt-6 flex flex-col gap-4">
            <Input label="E-mail" type="email" autoComplete="email" error={errors.email?.message} {...register('email')} />
            <Button type="submit" isLoading={isSubmitting} className="mt-2 w-full">
              Enviar link
            </Button>
          </form>
        )}

        <p className="mt-6 text-center text-xs text-gray-500">
          <Link to={ROUTES.login} className="font-medium text-primary-700 hover:underline">
            Voltar para o login
          </Link>
        </p>
      </div>
    </div>
  )
}
