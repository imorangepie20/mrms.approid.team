import { Navigate, Route, Routes } from "react-router-dom";
import { ThemeProvider } from "./context/ThemeContext";
import MainLayout from "./layouts/MainLayout";

import Dashboard from "./pages/dashboard/Dashboard";
import Analytics from "./pages/dashboard/Analytics";
import Widgets from "./pages/Widgets";
import Calendar from "./pages/Calendar";
import Gallery from "./pages/Gallery";
import Pricing from "./pages/Pricing";
import Products from "./pages/Products";
import Profile from "./pages/Profile";
import Settings from "./pages/Settings";
import ScrumBoard from "./pages/ScrumBoard";
import Error404 from "./pages/Error404";
import Login from "./pages/auth/Login";
import Register from "./pages/auth/Register";
import AiChat from "./pages/ai/AiChat";
import AiImageGenerator from "./pages/ai/AiImageGenerator";
import EmailCompose from "./pages/email/EmailCompose";
import EmailDetail from "./pages/email/EmailDetail";
import EmailInbox from "./pages/email/EmailInbox";
import PosCounterCheckout from "./pages/pos/PosCounterCheckout";
import PosCustomerOrder from "./pages/pos/PosCustomerOrder";
import PosKitchenOrder from "./pages/pos/PosKitchenOrder";
import PosMenuStock from "./pages/pos/PosMenuStock";
import PosTableBooking from "./pages/pos/PosTableBooking";
import ChartJs from "./pages/charts/ChartJs";
import FormElements from "./pages/forms/FormElements";
import FormPlugins from "./pages/forms/FormPlugins";
import FormWizards from "./pages/forms/FormWizards";
import TableElements from "./pages/tables/TableElements";
import TablePlugins from "./pages/tables/TablePlugins";
import UiBootstrap from "./pages/ui/UiBootstrap";
import UiButtons from "./pages/ui/UiButtons";
import UiCard from "./pages/ui/UiCard";
import UiIcons from "./pages/ui/UiIcons";
import UiModalNotification from "./pages/ui/UiModalNotification";
import UiTabsAccordions from "./pages/ui/UiTabsAccordions";
import UiTypography from "./pages/ui/UiTypography";

import EmsDashboard from "./pages/Dashboard";
import EmsSections from "./pages/Sections";
import EmsTracks from "./pages/Tracks";
import EmsIngestion from "./pages/Ingestion";
import SourceRoutines from "./pages/SourceRoutines";
import EmsStatistics from "./pages/Statistics";

function TemplateRoutes() {
  return (
    <Routes>
      <Route element={<MainLayout />}>
        <Route index element={<EmsDashboard />} />
        <Route path="template-dashboard" element={<Dashboard />} />
        <Route path="analytics" element={<Analytics />} />
        <Route path="widgets" element={<Widgets />} />
        <Route path="calendar" element={<Calendar />} />
        <Route path="gallery" element={<Gallery />} />
        <Route path="pricing" element={<Pricing />} />
        <Route path="products" element={<Products />} />
        <Route path="profile" element={<Profile />} />
        <Route path="settings" element={<Settings />} />
        <Route path="scrum-board" element={<ScrumBoard />} />
        <Route path="email/inbox" element={<EmailInbox />} />
        <Route path="email/compose" element={<EmailCompose />} />
        <Route path="email/detail/:id" element={<EmailDetail />} />
        <Route path="ai/chat" element={<AiChat />} />
        <Route path="ai/image-generator" element={<AiImageGenerator />} />
        <Route path="pos/customer-order" element={<PosCustomerOrder />} />
        <Route path="pos/kitchen-order" element={<PosKitchenOrder />} />
        <Route path="pos/counter-checkout" element={<PosCounterCheckout />} />
        <Route path="pos/table-booking" element={<PosTableBooking />} />
        <Route path="pos/menu-stock" element={<PosMenuStock />} />
        <Route path="ui/bootstrap" element={<UiBootstrap />} />
        <Route path="ui/buttons" element={<UiButtons />} />
        <Route path="ui/card" element={<UiCard />} />
        <Route path="ui/icons" element={<UiIcons />} />
        <Route path="ui/modal-notification" element={<UiModalNotification />} />
        <Route path="ui/tabs-accordions" element={<UiTabsAccordions />} />
        <Route path="ui/typography" element={<UiTypography />} />
        <Route path="form/elements" element={<FormElements />} />
        <Route path="form/plugins" element={<FormPlugins />} />
        <Route path="form/wizards" element={<FormWizards />} />
        <Route path="table/elements" element={<TableElements />} />
        <Route path="table/plugins" element={<TablePlugins />} />
        <Route path="chart/chartjs" element={<ChartJs />} />
        <Route path="ems" element={<EmsDashboard />} />
        <Route path="ems/sections" element={<Navigate to="/screens/ems" replace />} />
        <Route path="screens/home" element={<EmsSections key="home" screen="home" />} />
        <Route path="screens/ems" element={<EmsSections key="ems" screen="ems" />} />
        <Route path="ems/tracks" element={<EmsTracks />} />
        <Route path="ems/statistics" element={<EmsStatistics />} />
        <Route path="ems/ingestion" element={<EmsIngestion />} />
        <Route path="ems/routines" element={<SourceRoutines />} />
        <Route path="*" element={<Error404 />} />
      </Route>
      <Route path="login" element={<Login />} />
      <Route path="register" element={<Register />} />
      <Route path="*" element={<Error404 />} />
    </Routes>
  );
}

export default function App() {
  return (
    <ThemeProvider>
      <TemplateRoutes />
    </ThemeProvider>
  );
}
