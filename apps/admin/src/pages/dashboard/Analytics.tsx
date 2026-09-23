import {
    TrendingUp,
    TrendingDown,
    Users,
    Eye,
    Clock,
    MousePointer,
    Globe,
    Monitor,
    Smartphone,
    Tablet,
} from 'lucide-react'
import HudCard from '../../components/common/HudCard'
import StatCard from '../../components/common/StatCard'

const trafficSources = [
    { source: 'Direct', visitors: 5432, percentage: 35, color: '#00FFCC' },
    { source: 'Organic Search', visitors: 3987, percentage: 26, color: '#6366F1' },
    { source: 'Social Media', visitors: 2876, percentage: 19, color: '#FF1493' },
    { source: 'Referral', visitors: 1654, percentage: 11, color: '#FFA500' },
    { source: 'Email', visitors: 1234, percentage: 8, color: '#10B981' },
]

const topPages = [
    { page: '/products/wireless-headphones', views: 12543, bounceRate: 24.5 },
    { page: '/products/smart-watch-pro', views: 9876, bounceRate: 28.3 },
    { page: '/checkout', views: 7654, bounceRate: 45.2 },
    { page: '/categories/electronics', views: 6543, bounceRate: 32.1 },
    { page: '/about-us', views: 4321, bounceRate: 18.7 },
]

const Demographics = [
    { country: 'United States', visitors: 45234, percentage: 38 },
    { country: 'United Kingdom', visitors: 23456, percentage: 20 },
    { country: 'Germany', visitors: 15678, percentage: 13 },
    { country: 'Canada', visitors: 12345, percentage: 10 },
    { country: 'Australia', visitors: 9876, percentage: 8 },
]

const hourlyData = [
    { hour: '00', value: 120 }, { hour: '02', value: 80 }, { hour: '04', value: 45 },
    { hour: '06', value: 90 }, { hour: '08', value: 250 }, { hour: '10', value: 380 },
    { hour: '12', value: 420 }, { hour: '14', value: 390 }, { hour: '16', value: 450 },
    { hour: '18', value: 380 }, { hour: '20', value: 290 }, { hour: '22', value: 180 },
]

const Analytics = () => {
    const maxHourlyValue = Math.max(...hourlyData.map(d => d.value))

    return (
        <div className="space-y-6 animate-fade-in">
            {/* Page Header */}
            <div>
                <h1 className="text-2xl font-bold text-hud-text-primary">Analytics</h1>
                <p className="text-hud-text-muted mt-1">Track your website performance and user behavior.</p>
            </div>

            {/* Stats Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                <StatCard
                    title="Page Views"
                    value="254,832"
                    change={18.7}
                    icon={<Eye size={24} />}
                    variant="primary"
                />
                <StatCard
                    title="Unique Visitors"
                    value="45,123"
                    change={12.3}
                    icon={<Users size={24} />}
                    variant="secondary"
                />
                <StatCard
                    title="Avg. Session"
                    value="4m 32s"
                    change={-5.2}
                    icon={<Clock size={24} />}
                    variant="warning"
                />
                <StatCard
                    title="Bounce Rate"
                    value="32.4%"
                    change={-8.1}
                    changeLabel="lower is better"
                    icon={<MousePointer size={24} />}
                    variant="default"
                />
            </div>

            {/* Main Charts */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Hourly Traffic */}
                <HudCard
                    title="Hourly Traffic"
                    subtitle="Visitors by hour today"
                    className="lg:col-span-2"
                >
                    <div className="h-64 flex items-end justify-between gap-1">
                        {hourlyData.map((data) => (
                            <div key={data.hour} className="flex-1 flex flex-col items-center gap-2">
                                <div className="w-full relative group">
                                    <div
                                        className="w-full bg-gradient-to-t from-hud-accent-info to-hud-accent-info/30 rounded-t hover:from-hud-accent-primary hover:to-hud-accent-secondary transition-all duration-300 cursor-pointer"
                                        style={{ height: `${(data.value / maxHourlyValue) * 200}px` }}
                                    />
                                    <div className="absolute -top-8 left-1/2 -translate-x-1/2 bg-hud-bg-secondary border border-hud-border-secondary px-2 py-1 rounded text-xs text-hud-text-primary opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap">
                                        {data.value} visitors
                                    </div>
                                </div>
                                <span className="text-xs text-hud-text-muted">{data.hour}</span>
                            </div>
                        ))}
                    </div>
                </HudCard>

                {/* Device Distribution */}
                <HudCard title="Devices" subtitle="Traffic by device type">
                    <div className="space-y-6">
                        {[
                            { device: 'Desktop', icon: <Monitor size={20} />, percentage: 58, count: '26,171' },
                            { device: 'Mobile', icon: <Smartphone size={20} />, percentage: 35, count: '15,793' },
                            { device: 'Tablet', icon: <Tablet size={20} />, percentage: 7, count: '3,159' },
                        ].map((item) => (
                            <div key={item.device}>
                                <div className="flex items-center justify-between mb-2">
                                    <div className="flex items-center gap-3">
                                        <div className="text-hud-accent-primary">{item.icon}</div>
                                        <span className="text-sm text-hud-text-primary">{item.device}</span>
                                    </div>
                                    <div className="text-right">
                                        <span className="text-sm font-mono text-hud-text-primary">{item.percentage}%</span>
                                        <p className="text-xs text-hud-text-muted">{item.count}</p>
                                    </div>
                                </div>
                                <div className="h-2 bg-hud-bg-primary rounded-full overflow-hidden">
                                    <div
                                        className="h-full bg-gradient-to-r from-hud-accent-primary to-hud-accent-info rounded-full"
                                        style={{ width: `${item.percentage}%` }}
                                    />
                                </div>
                            </div>
                        ))}
                    </div>
                </HudCard>
            </div>

            {/* Traffic Sources & Demographics */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Traffic Sources */}
                <HudCard title="Traffic Sources" subtitle="Where your visitors come from">
                    <div className="flex gap-6">
                        {/* Donut Chart Placeholder */}
                        <div className="relative w-40 h-40 flex-shrink-0">
                            <svg viewBox="0 0 100 100" className="w-full h-full -rotate-90">
                                {trafficSources.reduce((acc, item, i) => {
                                    const prevTotal = acc.total
                                    const circumference = 2 * Math.PI * 40
                                    const strokeDasharray = `${(item.percentage / 100) * circumference} ${circumference}`
                                    const strokeDashoffset = -(prevTotal / 100) * circumference

                                    acc.elements.push(
                                        <circle
                                            key={item.source}
                                            cx="50"
                                            cy="50"
                                            r="40"
                                            fill="none"
                                            stroke={item.color}
                                            strokeWidth="12"
                                            strokeDasharray={strokeDasharray}
                                            strokeDashoffset={strokeDashoffset}
                                            className="transition-all duration-500"
                                        />
                                    )
                                    acc.total += item.percentage
                                    return acc
                                }, { elements: [] as JSX.Element[], total: 0 }).elements}
                            </svg>
                            <div className="absolute inset-0 flex flex-col items-center justify-center">
                                <span className="text-2xl font-bold text-hud-text-primary">15.2K</span>
                                <span className="text-xs text-hud-text-muted">Total</span>
                            </div>
                        </div>

                        {/* Legend */}
                        <div className="flex-1 space-y-3">
                            {trafficSources.map((item) => (
                                <div key={item.source} className="flex items-center justify-between">
                                    <div className="flex items-center gap-2">
                                        <div className="w-3 h-3 rounded-full" style={{ backgroundColor: item.color }} />
                                        <span className="text-sm text-hud-text-secondary">{item.source}</span>
                                    </div>
                                    <span className="text-sm font-mono text-hud-text-primary">{item.percentage}%</span>
                                </div>
                            ))}
                        </div>
                    </div>
                </HudCard>

                {/* Demographics */}
                <HudCard title="Top Countries" subtitle="Visitors by location" noPadding>
                    <div>
                        {Demographics.map((item, i) => (
                            <div
                                key={item.country}
                                className="flex items-center justify-between px-5 py-3 border-b border-hud-border-secondary last:border-0 hover:bg-hud-bg-hover transition-hud"
                            >
                                <div className="flex items-center gap-3">
                                    <span className="text-sm text-hud-text-muted w-6">{i + 1}.</span>
                                    <Globe size={16} className="text-hud-accent-primary" />
                                    <span className="text-sm text-hud-text-primary">{item.country}</span>
                                </div>
                                <div className="flex items-center gap-4">
                                    <span className="text-sm font-mono text-hud-text-secondary">{item.visitors.toLocaleString()}</span>
                                    <div className="w-24 h-2 bg-hud-bg-primary rounded-full overflow-hidden">
                                        <div
                                            className="h-full bg-hud-accent-primary rounded-full"
                                            style={{ width: `${item.percentage}%` }}
                                        />
                                    </div>
                                    <span className="text-sm font-mono text-hud-text-primary w-10 text-right">{item.percentage}%</span>
                                </div>
                            </div>
                        ))}
                    </div>
                </HudCard>
            </div>

            {/* Top Pages */}
            <HudCard title="Top Pages" subtitle="Most visited pages" noPadding>
                <div className="overflow-x-auto">
                    <table className="w-full">
                        <thead>
                            <tr className="border-b border-hud-border-secondary">
                                <th className="text-left px-5 py-3 text-xs font-medium text-hud-text-muted uppercase tracking-wider">#</th>
                                <th className="text-left px-5 py-3 text-xs font-medium text-hud-text-muted uppercase tracking-wider">Page URL</th>
                                <th className="text-left px-5 py-3 text-xs font-medium text-hud-text-muted uppercase tracking-wider">Page Views</th>
                                <th className="text-left px-5 py-3 text-xs font-medium text-hud-text-muted uppercase tracking-wider">Bounce Rate</th>
                                <th className="text-left px-5 py-3 text-xs font-medium text-hud-text-muted uppercase tracking-wider">Trend</th>
                            </tr>
                        </thead>
                        <tbody>
                            {topPages.map((page, i) => (
                                <tr key={page.page} className="border-b border-hud-border-secondary last:border-0 hover:bg-hud-bg-hover transition-hud">
                                    <td className="px-5 py-4 text-sm text-hud-text-muted">{i + 1}</td>
                                    <td className="px-5 py-4">
                                        <span className="text-sm font-mono text-hud-accent-primary">{page.page}</span>
                                    </td>
                                    <td className="px-5 py-4">
                                        <span className="text-sm font-mono text-hud-text-primary">{page.views.toLocaleString()}</span>
                                    </td>
                                    <td className="px-5 py-4">
                                        <span className={`text-sm font-mono ${page.bounceRate > 40 ? 'text-hud-accent-danger' : page.bounceRate > 30 ? 'text-hud-accent-warning' : 'text-hud-accent-success'}`}>
                                            {page.bounceRate}%
                                        </span>
                                    </td>
                                    <td className="px-5 py-4">
                                        {i % 2 === 0 ? (
                                            <TrendingUp size={18} className="text-hud-accent-success" />
                                        ) : (
                                            <TrendingDown size={18} className="text-hud-accent-danger" />
                                        )}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </HudCard>
        </div>
    )
}

export default Analytics
