import { useState } from 'react'
import { zodResolver } from '@hookform/resolvers/zod'
import { useForm } from 'react-hook-form'
import { Link } from 'react-router-dom'
import { z } from 'zod'
import { CheckCircle2 } from 'lucide-react'
import { Button } from '@/components/Button'
import { Input } from '@/components/Input'
import { signUp } from '@/features/auth/authService'
import { ROUTES } from '@/lib/routes'
import saoLuisEfcLogo from '@/assets/branding/sao-luis-efc-logo.png'

const signupSchema = z
  .object({
    fullName: z.string().min(1, 'Informe seu nome completo'),
    email: z.string().min(1, 'Informe seu e-mail').email('E-mail inválido'),
    password: z.string().min(6, 'A senha deve ter ao menos 6 caracteres'),
    confirmPassword: z.string().min(1, 'Confirme sua senha'),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: 'As senhas não coincidem',
    path: ['confirmPassword'],
  })

type SignupFormValues = z.infer<typeof signupSchema>

export function SignupPage() {
  const [formError, setFormError] = useState<string | null>(null)
  const [isDone, setIsDone] = useState(false)
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<SignupFormValues>({ resolver: zodResolver(signupSchema) })

  const onSubmit = handleSubmit(async (values) => {
    setFormError(null)
    try {
      await signUp(values)
      setIsDone(true)
    } catch (error) {
      setFormError(error instanceof Error ? mapSignupError(error.message) : 'Não foi possível criar a conta.')
    }
  })

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 p-4">
      <div className="w-full max-w-md rounded-2xl border border-gray-200 bg-white p-8 shadow-xl">
        <div className="flex justify-center">
          <img src={saoLuisEfcLogo} alt="Serviços Operacionais São Luís EFC" className="h-16 w-auto" />
        </div>

        <h1 className="mt-6 text-center text-lg font-semibold text-graphite-800">Criar conta</h1>
        <p className="mt-1 text-center text-sm text-gray-500">
          Só é possível concluir o cadastro com um e-mail convidado por um administrador.
        </p>

        {isDone ? (
          <div className="mt-6 flex flex-col items-center gap-3 rounded-xl bg-secondary-50 p-4 text-center">
            <CheckCircle2 className="size-8 text-secondary-600" />
            <p className="text-sm font-medium text-graphite-800">Conta criada com sucesso</p>
            <p className="text-sm text-gray-500">
              Verifique seu e-mail para confirmar a conta antes de entrar.
            </p>
            <Link
              to={ROUTES.login}
              className="mt-2 text-sm font-medium text-primary-700 hover:underline"
            >
              Voltar para o login
            </Link>
          </div>
        ) : (
          <form onSubmit={onSubmit} className="mt-6 flex flex-col gap-4">
            {formError && (
              <p role="alert" className="rounded-xl bg-magenta-50 px-3 py-2 text-sm text-magenta-700">
                {formError}
              </p>
            )}
            <Input label="Nome completo" autoComplete="name" error={errors.fullName?.message} {...register('fullName')} />
            <Input label="E-mail" type="email" autoComplete="email" error={errors.email?.message} {...register('email')} />
            <Input
              label="Senha"
              type="password"
              autoComplete="new-password"
              error={errors.password?.message}
              {...register('password')}
            />
            <Input
              label="Confirmar senha"
              type="password"
              autoComplete="new-password"
              error={errors.confirmPassword?.message}
              {...register('confirmPassword')}
            />
            <Button type="submit" isLoading={isSubmitting} className="mt-2 w-full">
              Criar conta
            </Button>
          </form>
        )}

        <p className="mt-6 text-center text-xs text-gray-500">
          Já tem conta?{' '}
          <Link to={ROUTES.login} className="font-medium text-primary-700 hover:underline">
            Entrar
          </Link>
        </p>
      </div>
    </div>
  )
}

function mapSignupError(message: string): string {
  if (message.includes('não autorizado') || message.includes('Database error saving new user')) {
    return 'Este e-mail não tem um convite pendente. Peça ao administrador para convidá-lo antes de se cadastrar.'
  }
  if (message.includes('already registered') || message.includes('already exists')) {
    return 'Já existe uma conta com este e-mail.'
  }
  return message
}
