import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import Login from './Login'

const { signInWithOAuth } = vi.hoisted(() => ({ signInWithOAuth: vi.fn() }))

vi.mock('../lib/supabase', () => ({
  supabase: { auth: { signInWithOAuth } },
}))

describe('login integration flow', () => {
  beforeEach(() => {
    signInWithOAuth.mockReset()
    signInWithOAuth.mockResolvedValue({ error: null })
    vi.stubGlobal('location', { origin: 'https://verneks.test' })
  })

  it('starts Google OAuth with the root redirect and disables the button while loading', async () => {
    let resolveOAuth
    signInWithOAuth.mockReturnValue(new Promise((resolve) => { resolveOAuth = resolve }))
    render(<Login />)

    const button = screen.getByRole('button', { name: /masuk dengan google/i })
    fireEvent.click(button)

    expect(button).toBeDisabled()
    expect(button).toHaveTextContent('Mengarahkan...')
    expect(signInWithOAuth).toHaveBeenCalledWith({
      provider: 'google',
      options: { redirectTo: 'https://verneks.test/' },
    })

    resolveOAuth({ error: null })
    await waitFor(() => expect(button).toBeDisabled())
  })

  it('shows a safe user-facing error when OAuth fails', async () => {
    signInWithOAuth.mockResolvedValue({ error: new Error('provider failed') })
    render(<Login />)

    fireEvent.click(screen.getByRole('button', { name: /masuk dengan google/i }))

    expect(await screen.findByText(/gagal masuk dengan google/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /masuk dengan google/i })).not.toBeDisabled()
  })
})
