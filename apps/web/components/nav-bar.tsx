'use client'
import { Button } from '@/components/ui/button'
import { createClient } from '@/lib/supabase/client'
import { type User } from '@supabase/supabase-js'
import { LogOut, Settings, House } from 'lucide-react'
import Image from 'next/image'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { CurrentUserAvatar } from './current-user-avatar'
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuGroup,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuTrigger,
} from './ui/dropdown-menu'

const Navbar = () => {
	const router = useRouter()

	const [user, setUser] = useState<User | null>(null)
	const [loading, setLoading] = useState(true)
	const supabase = createClient()

	useEffect(() => {
		const getUser = async () => {
			const {
				data: { user },
			} = await supabase.auth.getUser()
			setUser(user)
			setLoading(false)
		}

		getUser()

		const {
			data: { subscription },
		} = supabase.auth.onAuthStateChange((event, session) => {
			setUser(session?.user ?? null)
			setLoading(false)
		})

		return () => subscription.unsubscribe()
	}, [supabase.auth])

	const isAuthenticated = !!user
	const logout = async () => {
		const supabase = createClient()
		await supabase.auth.signOut()
		router.push('/auth/login')
	}

	return (
		<nav className="w-full p-4 flex justify-between">
			<div className="flex items-center gap-2">
				{/* Logo */}
				<Image
					src="/images/icons/splash-icon-prod.svg"
					className="dark:invert"
					height={32}
					width={32}
					alt="Logo"
				/>
				<span className="text-lg font-semibold tracking-tighter">Turbo Fit</span>
			</div>

			<div className="flex gap-2">
				{/* Show avatar only if user is authenticated */}
				{isAuthenticated && (
					<DropdownMenu>
						<DropdownMenuTrigger asChild>
							<Button
								variant="secondary"
								size="icon"
								className="overflow-hidden rounded-full cursor-pointer"
							>
								<CurrentUserAvatar />
							</Button>
						</DropdownMenuTrigger>
						<DropdownMenuContent className="w-56">
							<DropdownMenuLabel>My Account</DropdownMenuLabel>
							<DropdownMenuGroup>
								<DropdownMenuItem asChild>
									<Button asChild variant="ghost" className="w-full justify-start  cursor-pointer">
										<a href="/" className="text-popover-foreground">
                      <House />
											Dashboard
										</a>
									</Button>
								</DropdownMenuItem>
								<DropdownMenuItem asChild>
									<Button asChild variant="ghost" className="w-full justify-start  cursor-pointer">
										<a href="/settings" className="text-popover-foreground">
											<Settings />
											Settings
										</a>
									</Button>
								</DropdownMenuItem>
								<DropdownMenuItem asChild>
									<Button
										onClick={logout}
										variant="ghost"
										className="w-full justify-start cursor-pointer"
									>
										<LogOut />
										<span className="text-popover-foreground">Sign Out</span>
									</Button>
								</DropdownMenuItem>

								{/* <Button onClick={logout}>Logout</Button> */}
							</DropdownMenuGroup>
						</DropdownMenuContent>
					</DropdownMenu>
				)}

				{/* Show login/signup buttons only if user is NOT authenticated */}
				{!isAuthenticated && (
					<>
						<Button asChild variant="outline">
							<a href="/auth/login">Login</a>
						</Button>
						<Button asChild>
							<a href="/auth/sign-up">Signup</a>
						</Button>
					</>
				)}
			</div>
		</nav>
	)
}

export { Navbar }
