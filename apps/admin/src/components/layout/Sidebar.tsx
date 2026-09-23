import { useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import {
    LayoutDashboard,
    BarChart3,
    Mail,
    Grid3X3,
    User,
    Calendar,
    Settings,
    HelpCircle,
    Sparkles,
    UtensilsCrossed,
    ChevronDown,
    ChevronRight,
    Layers,
    FileText,
    Table,
    PieChart,
    Kanban,
    ShoppingBag,
    DollarSign,
    Image,
} from 'lucide-react'

interface SidebarProps {
    collapsed: boolean
    onToggle: () => void
}

interface MenuItem {
    title: string
    icon: React.ReactNode
    path?: string
    children?: { title: string; path: string }[]
}

const menuItems: MenuItem[] = [
    { title: 'Dashboard', icon: <LayoutDashboard size={20} />, path: '/' },
    { title: 'Analytics', icon: <BarChart3 size={20} />, path: '/analytics' },
    {
        title: 'Email',
        icon: <Mail size={20} />,
        children: [
            { title: 'Inbox', path: '/email/inbox' },
            { title: 'Compose', path: '/email/compose' },
            { title: 'Detail', path: '/email/detail/1' },
        ],
    },
    { title: 'Widgets', icon: <Grid3X3 size={20} />, path: '/widgets' },
    {
        title: 'AI Studio',
        icon: <Sparkles size={20} />,
        children: [
            { title: 'AI Chat', path: '/ai/chat' },
            { title: 'AI Image Generator', path: '/ai/image-generator' },
        ],
    },
    {
        title: 'POS System',
        icon: <UtensilsCrossed size={20} />,
        children: [
            { title: 'Customer Order', path: '/pos/customer-order' },
            { title: 'Kitchen Order', path: '/pos/kitchen-order' },
            { title: 'Counter Checkout', path: '/pos/counter-checkout' },
            { title: 'Table Booking', path: '/pos/table-booking' },
            { title: 'Menu Stock', path: '/pos/menu-stock' },
        ],
    },
    {
        title: 'UI Kits',
        icon: <Layers size={20} />,
        children: [
            { title: 'Bootstrap', path: '/ui/bootstrap' },
            { title: 'Buttons', path: '/ui/buttons' },
            { title: 'Cards', path: '/ui/card' },
            { title: 'Icons', path: '/ui/icons' },
            { title: 'Modal & Notification', path: '/ui/modal-notification' },
            { title: 'Typography', path: '/ui/typography' },
            { title: 'Tabs & Accordions', path: '/ui/tabs-accordions' },
        ],
    },
    {
        title: 'Forms',
        icon: <FileText size={20} />,
        children: [
            { title: 'Form Elements', path: '/form/elements' },
            { title: 'Form Plugins', path: '/form/plugins' },
            { title: 'Form Wizards', path: '/form/wizards' },
        ],
    },
    {
        title: 'Tables',
        icon: <Table size={20} />,
        children: [
            { title: 'Table Elements', path: '/table/elements' },
            { title: 'Table Plugins', path: '/table/plugins' },
        ],
    },
    {
        title: 'Charts',
        icon: <PieChart size={20} />,
        children: [
            { title: 'Chart.js', path: '/chart/chartjs' },
        ],
    },
    { title: 'Scrum Board', icon: <Kanban size={20} />, path: '/scrum-board' },
    { title: 'Products', icon: <ShoppingBag size={20} />, path: '/products' },
    { title: 'Pricing', icon: <DollarSign size={20} />, path: '/pricing' },
    { title: 'Gallery', icon: <Image size={20} />, path: '/gallery' },
    { title: 'Profile', icon: <User size={20} />, path: '/profile' },
    { title: 'Calendar', icon: <Calendar size={20} />, path: '/calendar' },
    { title: 'Settings', icon: <Settings size={20} />, path: '/settings' },
]

const Sidebar = ({ collapsed, onToggle }: SidebarProps) => {
    const location = useLocation()
    const [expandedMenus, setExpandedMenus] = useState<string[]>([])

    const toggleMenu = (title: string) => {
        setExpandedMenus(prev =>
            prev.includes(title)
                ? prev.filter(item => item !== title)
                : [...prev, title]
        )
    }

    const isActive = (path?: string) => {
        if (!path) return false
        return location.pathname === path
    }

    const isParentActive = (children?: { path: string }[]) => {
        if (!children) return false
        return children.some(child => location.pathname === child.path)
    }

    return (
        <aside
            className={`fixed top-0 left-0 h-full bg-hud-bg-secondary border-r border-hud-border-secondary z-50 transition-all duration-300 ${collapsed ? 'w-20' : 'w-64'
                }`}
        >
            {/* Logo */}
            <div className="h-16 flex items-center justify-center border-b border-hud-border-secondary">
                <Link to="/" className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-gradient-to-br from-hud-accent-primary to-hud-accent-info rounded-lg flex items-center justify-center font-bold text-hud-bg-primary">
                        H
                    </div>
                    {!collapsed && (
                        <span className="font-semibold text-lg text-glow">ALPHA TEAM</span>
                    )}
                </Link>
            </div>

            {/* Navigation */}
            <nav className="py-4 overflow-y-auto h-[calc(100%-4rem)]">
                <ul className="space-y-1 px-3">
                    {menuItems.map((item) => (
                        <li key={item.title}>
                            {item.children ? (
                                // Menu with children
                                <div>
                                    <button
                                        onClick={() => toggleMenu(item.title)}
                                        className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg transition-hud ${isParentActive(item.children)
                                            ? 'bg-hud-accent-primary/10 text-hud-accent-primary'
                                            : 'text-hud-text-secondary hover:bg-hud-bg-hover hover:text-hud-text-primary'
                                            }`}
                                    >
                                        {item.icon}
                                        {!collapsed && (
                                            <>
                                                <span className="flex-1 text-left text-sm">{item.title}</span>
                                                {expandedMenus.includes(item.title) ? (
                                                    <ChevronDown size={16} />
                                                ) : (
                                                    <ChevronRight size={16} />
                                                )}
                                            </>
                                        )}
                                    </button>

                                    {/* Submenu */}
                                    {!collapsed && expandedMenus.includes(item.title) && (
                                        <ul className="mt-1 ml-8 space-y-1">
                                            {item.children.map((child) => (
                                                <li key={child.path}>
                                                    <Link
                                                        to={child.path}
                                                        className={`block px-3 py-2 rounded-lg text-sm transition-hud ${isActive(child.path)
                                                            ? 'text-hud-accent-primary bg-hud-accent-primary/10'
                                                            : 'text-hud-text-secondary hover:text-hud-text-primary hover:bg-hud-bg-hover'
                                                            }`}
                                                    >
                                                        {child.title}
                                                    </Link>
                                                </li>
                                            ))}
                                        </ul>
                                    )}
                                </div>
                            ) : (
                                // Single menu item
                                <Link
                                    to={item.path!}
                                    className={`flex items-center gap-3 px-3 py-2.5 rounded-lg transition-hud ${isActive(item.path)
                                        ? 'menu-active text-hud-accent-primary'
                                        : 'text-hud-text-secondary hover:bg-hud-bg-hover hover:text-hud-text-primary'
                                        }`}
                                >
                                    {item.icon}
                                    {!collapsed && <span className="text-sm">{item.title}</span>}
                                </Link>
                            )}
                        </li>
                    ))}
                </ul>
            </nav>
        </aside>
    )
}

export default Sidebar
