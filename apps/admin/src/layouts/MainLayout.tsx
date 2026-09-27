import { useEffect, useState } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import Sidebar from '../components/layout/Sidebar'
import Header from '../components/layout/Header'

const persistentSidebarQuery = '(min-width: 1536px)'

const MainLayout = () => {
    const location = useLocation()
    const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
    const [drawerOpen, setDrawerOpen] = useState(false)
    const [persistentSidebar, setPersistentSidebar] = useState(() => window.matchMedia(persistentSidebarQuery).matches)

    useEffect(() => {
        const media = window.matchMedia(persistentSidebarQuery)
        const syncSidebarMode = (event: MediaQueryListEvent) => {
            setPersistentSidebar(event.matches)
            setDrawerOpen(false)
        }

        media.addEventListener('change', syncSidebarMode)
        return () => media.removeEventListener('change', syncSidebarMode)
    }, [])

    useEffect(() => {
        setDrawerOpen(false)
    }, [location.pathname])

    const effectiveCollapsed = persistentSidebar && sidebarCollapsed
    const sidebarOpen = persistentSidebar || drawerOpen
    const toggleSidebar = () => {
        if (persistentSidebar) {
            setSidebarCollapsed(current => !current)
            return
        }
        setDrawerOpen(current => !current)
    }

    return (
        <div className="min-h-screen min-w-0 overflow-x-hidden bg-hud-bg-primary hud-grid-bg">
            {/* Sidebar */}
            <Sidebar
                collapsed={effectiveCollapsed}
                onNavigate={() => setDrawerOpen(false)}
                open={sidebarOpen}
            />

            {!persistentSidebar && drawerOpen && (
                <button
                    aria-label="사이드바 닫기"
                    className="fixed inset-0 z-[45] bg-black/55"
                    onClick={() => setDrawerOpen(false)}
                    type="button"
                />
            )}

            {/* Main Content */}
            <div className={`min-w-0 max-w-full transition-[margin] duration-300 ${persistentSidebar ? (effectiveCollapsed ? 'ml-20' : 'ml-64') : 'ml-0'}`}>
                {/* Header */}
                <Header onMenuToggle={toggleSidebar} />

                {/* Page Content */}
                <main className="min-w-0 max-w-full overflow-x-hidden p-4 sm:p-6">
                    <Outlet />
                </main>
            </div>
        </div>
    )
}

export default MainLayout
