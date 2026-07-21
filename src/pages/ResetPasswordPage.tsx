import { useState } from 'react'
import { zodResolver } from '@hookform/resolvers/zod'
import { useForm } from 'react-hook-form'
import { useNavigate } from 'react-router-dom'
import { z } from 'zod'
import { Button } from '@/components/Button'
import { Input } from '@/components/Input'
import { updatePassword } from '@/features/auth/authService'
import { supabase } from '@/lib/supabase'
import { ROUTES } from '@/lib/routes'
import saoLuisEfcLogo from '@/assets/branding/sao-luis-efc-logo.png'

const resetPasswordSchema = z
  .object({
    password: z.string().min(6, 'A senha deve ter ao menos 6 caracteres'),
    confirmPassword: z.string().min(1, 'Confirme sua nova senha'),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: 'As senhas não coincidem',
    path: ['confirmPassword'],
  })

type ResetPasswordFormValues = z.infer<typeof resetPasswordSchema>

export function ResetPasswordPage() {
  const navigate = useNavigate()
  const [formError, setFormError] = useState<string | null>(null)
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ResetPasswordFormValues>({ resolver: zodResolver(resetPasswordSchema) })

  const onSubmit = handleSubmit(async (values) => {
    setFormError(null)
    try {
      await updatePassword(values.password)
      await supabase.auth.signOut()
      navigate(ROUTES.login, { replace: true, state: { passwordUpdated: true } })
    } catch (error) {
      setFormError(error instanceof Error ? error.message : 'Não foi possível atualizar a senha.')
    }
  })

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 p-4">
      <div className="w-full max-w-md rounded-2xl border border-gray-200 bg-white p-8 shadow-xl">
        <div className="flex justify-center">
          <img src={saoLuisEfcLogo} alt="Serviços Operacionais São Luís EFC" className="h-16 w-auto" />
        </div>

        <h1 className="mt-6 text-center text-lg font-semibold text-graphite-800">Definir nova senha</h1>
        <p className="mt-1 text-center text-sm text-gray-500">
          Escolha uma nova senha para sua conta.
        </p>

        <form onSubmit={onSubmit} className="mt-6 flex flex-col gap-4">
          {formError && (
            <p role="alert" className="rounded-xl bg-magenta-50 px-3 py-2 text-sm text-magenta-700">
              {formError}
            </p>
          )}
          <Input
            label="Nova senha"
            type="password"
            autoComplete="new-password"
            error={errors.password?.message}
            {...register('password')}
          />
          <Input
            label="Confirmar nova senha"
            type="password"
            autoComplete="new-password"
            error={errors.confirmPassword?.message}
            {...register('confirmPassword')}
          />
          <Button type="submit" isLoading={isSubmitting} className="mt-2 w-full">
            Salvar nova senha
          </Button>
        </form>
      </div>
    </div>
  )
}
