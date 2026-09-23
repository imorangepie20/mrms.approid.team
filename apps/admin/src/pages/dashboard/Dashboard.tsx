import {
    DollarSign,
    Users,
    ShoppingCart,
    TrendingUp,
    Activity,
    Globe,
    Clock,
    ArrowUpRight,
    Star,
} from 'lucide-react'
import HudCard from '../../components/common/HudCard'
import StatCard from '../../components/common/StatCard'
import Button from '../../components/common/Button'
import PremiumCard from '../../components/ui/PremiumCard'

// Sample data
const recentOrders = [
    { id: '#ORD-001', customer: 'John Doe', amount: '$1,299.00', status: 'Completed', date: '2 min ago' },
    { id: '#ORD-002', customer: 'Jane Smith', amount: '$899.00', status: 'Processing', date: '15 min ago' },
    { id: '#ORD-003', customer: 'Bob Johnson', amount: '$2,199.00', status: 'Pending', date: '1 hour ago' },
    { id: '#ORD-004', customer: 'Alice Brown', amount: '$599.00', status: 'Completed', date: '2 hours ago' },
    { id: '#ORD-005', customer: 'Charlie Wilson', amount: '$1,499.00', status: 'Shipped', date: '3 hours ago' },
]

const topProducts = [
    { name: 'Wireless Headphones', sales: 1234, revenue: '$123,400', growth: 12 },
    { name: 'Smart Watch Pro', sales: 987, revenue: '$98,700', growth: 8 },
    { name: 'Laptop Stand', sales: 756, revenue: '$37,800', growth: -3 },
    { name: 'USB-C Hub', sales: 654, revenue: '$32,700', growth: 15 },
    { name: 'Mechanical Keyboard', sales: 543, revenue: '$54,300', growth: 5 },
]

const serverStats = [
    { label: 'CPU Usage', value: 67, color: 'hud-accent-primary' },
    { label: 'Memory', value: 45, color: 'hud-accent-info' },
    { label: 'Storage', value: 78, color: 'hud-accent-warning' },
    { label: 'Network', value: 23, color: 'hud-accent-secondary' },
]

const getStatusColor = (status: string) => {
    switch (status) {
        case 'Completed':
            return 'text-hud-accent-success bg-hud-accent-success/10'
        case 'Processing':
            return 'text-hud-accent-info bg-hud-accent-info/10'
        case 'Pending':
            return 'text-hud-accent-warning bg-hud-accent-warning/10'
        case 'Shipped':
            return 'text-hud-accent-primary bg-hud-accent-primary/10'
        default:
            return 'text-hud-text-muted bg-hud-bg-hover'
    }
}

const Dashboard = () => {
    return (
        <div className="space-y-6 animate-fade-in">
            {/* Page Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-hud-text-primary">Dashboard</h1>
                    <p className="text-hud-text-muted mt-1">Welcome back! Here's what's happening.</p>
                </div>
                <Button variant="primary" glow leftIcon={<Activity size={18} />}>
                    View Reports
                </Button>
            </div>

            {/* Stats Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                <StatCard
                    title="Total Revenue"
                    value="$54,239"
                    change={12.5}
                    icon={<DollarSign size={24} />}
                    variant="primary"
                />
                <StatCard
                    title="Total Users"
                    value="3,842"
                    change={8.2}
                    icon={<Users size={24} />}
                    variant="secondary"
                />
                <StatCard
                    title="Total Orders"
                    value="1,429"
                    change={-2.4}
                    icon={<ShoppingCart size={24} />}
                    variant="warning"
                />
                <StatCard
                    title="Conversion Rate"
                    value="3.24%"
                    change={4.1}
                    icon={<TrendingUp size={24} />}
                    variant="default"
                />
            </div>
            {/* Premium Card showcase */}
            <PremiumCard
                title="Premium Insights"
                value="+23%"
                change={23}
                icon={<Star size={24} />}
                variant="primary"
            />

            {/* Charts Row */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Main Chart */}
                <HudCard
                    title="Revenue Overview"
                    subtitle="Monthly revenue for the year"
                    className="lg:col-span-2"
                    action={
                        <select className="bg-hud-bg-primary border border-hud-border-secondary rounded px-3 py-1.5 text-sm text-hud-text-secondary focus:outline-none focus:border-hud-accent-primary">
                            <option>Last 12 months</option>
                            <option>Last 6 months</option>
                            <option>Last 3 months</option>
                        </select>
                    }
                >
                    <div className="h-64 flex items-end justify-between gap-2">
                        {['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'].map((month, i) => {
                            const heights = [40, 55, 45, 60, 75, 65, 80, 70, 85, 75, 90, 95]
                            return (
                                <div key={month} className="flex-1 flex flex-col items-center gap-2">
                                    <div
                                        className="w-full bg-gradient-to-t from-hud-accent-primary to-hud-accent-primary/50 rounded-t hover:from-hud-accent-primary hover:to-hud-accent-secondary transition-all duration-300 cursor-pointer"
                                        style={{ height: `${heights[i]}%` }}
                                    />
                                    <span className="text-xs text-hud-text-muted">{month}</span>
                                </div>
                            )
                        })}
                    </div>
                </HudCard>

                {/* Server Stats */}
                <HudCard title="Server Status" subtitle="Real-time system metrics">
                    <div className="space-y-4">
                        {serverStats.map((stat) => (
                            <div key={stat.label}>
                                <div className="flex justify-between text-sm mb-1.5">
                                    <span className="text-hud-text-secondary">{stat.label}</span>
                                    <span className="text-hud-text-primary font-mono">{stat.value}%</span>
                                </div>
                                <div className="h-2 bg-hud-bg-primary rounded-full overflow-hidden">
                                    <div
                                        className={`h-full bg-${stat.color} rounded-full transition-all duration-500`}
                                        style={{
                                            width: `${stat.value}%`,
                                            background: stat.color === 'hud-accent-primary' ? 'var(--hud-accent-primary)' :
                                                stat.color === 'hud-accent-info' ? 'var(--hud-accent-info)' :
                                                    stat.color === 'hud-accent-warning' ? 'var(--hud-accent-warning)' : 'var(--hud-accent-secondary)'
                                        }}
                                    />
                                </div>
                            </div>
                        ))}
                    </div>
                    <div className="mt-6 pt-4 border-t border-hud-border-secondary">
                        <div className="flex items-center gap-2 text-sm text-hud-text-muted">
                            <Clock size={14} />
                            <span>Last updated: Just now</span>
                        </div>
                    </div>
                </HudCard>
            </div>

            {/* Tables Row */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Recent Orders */}
                <HudCard
                    title="Recent Orders"
                    subtitle="Latest customer orders"
                    noPadding
                    action={
                        <Button variant="ghost" size="sm" rightIcon={<ArrowUpRight size={14} />}>
                            View All
                        </Button>
                    }
                >
                    <div className="overflow-x-auto">
                        <table className="w-full">
                            <thead>
                                <tr className="border-b border-hud-border-secondary">
                                    <th className="text-left px-5 py-3 text-xs font-medium text-hud-text-muted uppercase tracking-wider">Order</th>
                                    <th className="text-left px-5 py-3 text-xs font-medium text-hud-text-muted uppercase tracking-wider">Customer</th>
                                    <th className="text-left px-5 py-3 text-xs font-medium text-hud-text-muted uppercase tracking-wider">Amount</th>
                                    <th className="text-left px-5 py-3 text-xs font-medium text-hud-text-muted uppercase tracking-wider">Status</th>
                                </tr>
                            </thead>
                            <tbody>
                                {recentOrders.map((order) => (
                                    <tr key={order.id} className="border-b border-hud-border-secondary last:border-0 hover:bg-hud-bg-hover transition-hud">
                                        <td className="px-5 py-3">
                                            <span className="text-sm font-mono text-hud-accent-primary">{order.id}</span>
                                        </td>
                                        <td className="px-5 py-3">
                                            <span className="text-sm text-hud-text-primary">{order.customer}</span>
                                            <p className="text-xs text-hud-text-muted">{order.date}</p>
                                        </td>
                                        <td className="px-5 py-3">
                                            <span className="text-sm font-mono text-hud-text-primary">{order.amount}</span>
                                        </td>
                                        <td className="px-5 py-3">
                                            <span className={`inline-flex px-2.5 py-1 rounded text-xs font-medium ${getStatusColor(order.status)}`}>
                                                {order.status}
                                            </span>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </HudCard>

                {/* Top Products */}
                <HudCard
                    title="Top Products"
                    subtitle="Best selling items"
                    noPadding
                    action={
                        <Button variant="ghost" size="sm" rightIcon={<ArrowUpRight size={14} />}>
                            View All
                        </Button>
                    }
                >
                    <div className="overflow-x-auto">
                        <table className="w-full">
                            <thead>
                                <tr className="border-b border-hud-border-secondary">
                                    <th className="text-left px-5 py-3 text-xs font-medium text-hud-text-muted uppercase tracking-wider">Product</th>
                                    <th className="text-left px-5 py-3 text-xs font-medium text-hud-text-muted uppercase tracking-wider">Sales</th>
                                    <th className="text-left px-5 py-3 text-xs font-medium text-hud-text-muted uppercase tracking-wider">Revenue</th>
                                    <th className="text-left px-5 py-3 text-xs font-medium text-hud-text-muted uppercase tracking-wider">Growth</th>
                                </tr>
                            </thead>
                            <tbody>
                                {topProducts.map((product) => (
                                    <tr key={product.name} className="border-b border-hud-border-secondary last:border-0 hover:bg-hud-bg-hover transition-hud">
                                        <td className="px-5 py-3">
                                            <span className="text-sm text-hud-text-primary">{product.name}</span>
                                        </td>
                                        <td className="px-5 py-3">
                                            <span className="text-sm font-mono text-hud-text-secondary">{product.sales.toLocaleString()}</span>
                                        </td>
                                        <td className="px-5 py-3">
                                            <span className="text-sm font-mono text-hud-text-primary">{product.revenue}</span>
                                        </td>
                                        <td className="px-5 py-3">
                                            <span className={`text-sm font-medium ${product.growth >= 0 ? 'text-hud-accent-success' : 'text-hud-accent-danger'}`}>
                                                {product.growth >= 0 ? '+' : ''}{product.growth}%
                                            </span>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </HudCard>
            </div>

            {/* Activity Feed */}
            <HudCard
                title="Recent Activity"
                subtitle="Latest actions across the platform"
                action={
                    <div className="flex items-center gap-2">
                        <Globe size={16} className="text-hud-accent-primary" />
                        <span className="text-sm text-hud-text-secondary">Live</span>
                    </div>
                }
            >
                <div className="space-y-4">
                    {[
                        { action: 'New order received', detail: 'Order #ORD-006 from Sarah Connor - $2,499.00', time: '2 minutes ago', type: 'order' },
                        { action: 'User registered', detail: 'New user: michael.brown@email.com', time: '5 minutes ago', type: 'user' },
                        { action: 'Payment processed', detail: 'Payment of $1,299.00 received for Order #ORD-001', time: '10 minutes ago', type: 'payment' },
                        { action: 'Product stock low', detail: 'Wireless Headphones - Only 5 units remaining', time: '15 minutes ago', type: 'warning' },
                        { action: 'Review submitted', detail: '5-star review for Smart Watch Pro by John D.', time: '20 minutes ago', type: 'review' },
                    ].map((activity, i) => (
                        <div key={i} className="flex items-start gap-4 p-3 rounded-lg hover:bg-hud-bg-hover transition-hud">
                            <div className={`w-2 h-2 mt-2 rounded-full flex-shrink-0 ${activity.type === 'order' ? 'bg-hud-accent-primary' :
                                    activity.type === 'user' ? 'bg-hud-accent-info' :
                                        activity.type === 'payment' ? 'bg-hud-accent-success' :
                                            activity.type === 'warning' ? 'bg-hud-accent-warning' :
                                                'bg-hud-accent-secondary'
                                }`} />
                            <div className="flex-1">
                                <p className="text-sm text-hud-text-primary">{activity.action}</p>
                                <p className="text-xs text-hud-text-muted mt-0.5">{activity.detail}</p>
                            </div>
                            <span className="text-xs text-hud-text-muted whitespace-nowrap">{activity.time}</span>
                        </div>
                    ))}
                </div>
            </HudCard>
        </div>
    )
}

export default Dashboard
