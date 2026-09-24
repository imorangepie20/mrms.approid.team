import { useState } from 'react'
import { Link } from 'react-router-dom'
import {
    Search,
    Bell,
    Menu,
    Mail,
    Calendar,
    Settings,
    LogOut,
    User,
    ChevronDown,
  Sun, Moon,
} from 'lucide-react'
import { useTheme } from '../../context/ThemeContext'

interface HeaderProps {
    onMenuToggle: () => void
}

const notifications = [
    { id: 1, title: 'New order received ($1,299)', time: 'Just now', isNew: true },
    { id: 2, title: '3 new accounts created', time: '2 minutes ago', isNew: true },
    { id: 3, title: 'Setup completed', time: '3 minutes ago', isNew: false },
    { id: 4, title: 'Widget installation done', time: '5 minutes ago', isNew: false },
    { id: 5, title: 'Payment method enabled', time: '10 minutes ago', isNew: false },
]

const Header = ({ onMenuToggle }: HeaderProps) => {
    const [showNotifications, setShowNotifications] = useState(false)
    const [showProfile, setShowProfile] = useState(false)
    const { isDark, toggleTheme } = useTheme()

    return (
        <header className="h-16 bg-hud-bg-secondary/80 backdrop-blur-md border-b border-hud-border-secondary px-6 flex items-center justify-between sticky top-0 z-40">
            {/* Left Section */}
            <div className="flex items-center gap-4">
                <button
                    onClick={onMenuToggle}
                    className="p-2 rounded-lg hover:bg-hud-bg-hover transition-hud text-hud-text-secondary hover:text-hud-text-primary"
                >
                    <Menu size={20} />
                </button>

                {/* Search */}
                <div className="relative hidden md:block">
                    <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center">
                        <Search className="text-hud-text-muted" size={18} />
                    </span>
                    <input
                        type="text"
                        placeholder="Search..."
                        className="w-64 pl-4 pr-10 py-2 bg-hud-bg-primary border border-hud-border-secondary rounded-lg text-sm text-hud-text-primary placeholder-hud-text-muted focus:outline-none focus:border-hud-accent-primary transition-hud"
                    />
                </div>
            </div>

            {/* Right Section */}
            <div className="flex items-center gap-2">
                {/* Quick Links */}
                <div className="hidden lg:flex items-center gap-1">
                    <Link
                        to="/email/inbox"
                        className="p-2 rounded-lg hover:bg-hud-bg-hover transition-hud text-hud-text-secondary hover:text-hud-accent-primary"
                        title="Inbox"
                    >
                        <Mail size={20} />
                    </Link>
                    <Link
                        to="/calendar"
                        className="p-2 rounded-lg hover:bg-hud-bg-hover transition-hud text-hud-text-secondary hover:text-hud-accent-primary"
                        title="Calendar"
                    >
                        <Calendar size={20} />
                    </Link>
                    <Link
                        to="/settings"
                        className="p-2 rounded-lg hover:bg-hud-bg-hover transition-hud text-hud-text-secondary hover:text-hud-accent-primary"
                        title="Settings"
                    >
                        <Settings size={20} />
                    </Link>
                </div>
                {/* Theme Toggle */}
                <button onClick={toggleTheme} className="p-2 rounded-lg hover:bg-hud-bg-hover transition-hud text-hud-text-secondary hover:text-hud-accent-primary">
                  {isDark ? <Sun size={20} /> : <Moon size={20} />}
                </button>

                {/* Divider */}
                <div className="w-px h-8 bg-hud-border-secondary mx-2 hidden lg:block" />

                {/* Notifications */}
                <div className="relative">
                    <button
                        onClick={() => {
                            setShowNotifications(!showNotifications)
                            setShowProfile(false)
                        }}
                        className="relative p-2 rounded-lg hover:bg-hud-bg-hover transition-hud text-hud-text-secondary hover:text-hud-accent-primary"
                    >
                        <Bell size={20} />
                        <span className="absolute top-1 right-1 w-2 h-2 bg-hud-accent-danger rounded-full animate-pulse" />
                    </button>

                    {/* Notifications Dropdown */}
                    {showNotifications && (
                        <div className="absolute right-0 mt-2 w-80 bg-hud-bg-secondary border border-hud-border-secondary rounded-lg shadow-hud-glow animate-fade-in overflow-hidden">
                            <div className="px-4 py-3 border-b border-hud-border-secondary">
                                <h3 className="font-semibold text-hud-text-primary">Notifications</h3>
                            </div>
                            <div className="max-h-80 overflow-y-auto">
                                {notifications.map((notif) => (
                                    <div
                                        key={notif.id}
                                        className="px-4 py-3 hover:bg-hud-bg-hover transition-hud cursor-pointer border-b border-hud-border-secondary last:border-0"
                                    >
                                        <div className="flex items-start gap-3">
                                            {notif.isNew && (
                                                <span className="w-2 h-2 mt-2 bg-hud-accent-primary rounded-full flex-shrink-0" />
                                            )}
                                            <div className={notif.isNew ? '' : 'ml-5'}>
                                                <p className="text-sm text-hud-text-primary">{notif.title}</p>
                                                <p className="text-xs text-hud-text-muted mt-1">{notif.time}</p>
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                            <div className="px-4 py-3 border-t border-hud-border-secondary">
                                <button className="w-full text-sm text-hud-accent-primary hover:underline">
                                    See All Notifications
                                </button>
                            </div>
                        </div>
                    )}
                </div>

                {/* Profile */}
                <div className="relative">
                    <button
                        onClick={() => {
                            setShowProfile(!showProfile)
                            setShowNotifications(false)
                        }}
                        className="flex items-center gap-2 p-2 rounded-lg hover:bg-hud-bg-hover transition-hud"
                    >
                        <div className="w-8 h-8 rounded-full bg-gradient-to-br from-hud-accent-primary to-hud-accent-secondary flex items-center justify-center">
                            <User size={16} className="text-hud-bg-primary" />
                        </div>
                        <span className="hidden md:block text-sm text-hud-text-primary">Admin</span>
                        <ChevronDown size={16} className="hidden md:block text-hud-text-muted" />
                    </button>

                    {/* Profile Dropdown */}
                    {showProfile && (
                        <div className="absolute right-0 mt-2 w-48 bg-hud-bg-secondary border border-hud-border-secondary rounded-lg shadow-hud-glow animate-fade-in overflow-hidden">
                            <div className="px-4 py-3 border-b border-hud-border-secondary">
                                <p className="font-semibold text-hud-text-primary">관리자</p>
                                <p className="text-xs text-hud-text-muted">Music Pie 운영 화면</p>
                            </div>
                            <div className="py-1">
                                <a
                                    href="/"
                                    className="flex items-center gap-3 px-4 py-2 text-sm text-hud-text-secondary hover:bg-hud-bg-hover hover:text-hud-text-primary transition-hud"
                                >
                                    <User size={16} />
                                    회원 화면
                                </a>
                            </div>
                            <div className="border-t border-hud-border-secondary py-1">
                                <a
                                    href="/api/auth/logout"
                                    className="flex items-center gap-3 px-4 py-2 text-sm text-hud-accent-danger hover:bg-hud-bg-hover transition-hud"
                                >
                                    <LogOut size={16} />
                                    로그아웃
                                </a>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </header>
    )
}

export default Header
