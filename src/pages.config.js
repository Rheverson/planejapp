import Accounts from './pages/Accounts';
import Goals from './pages/Goals';
import Home from './pages/Home';
import Profile from './pages/Profile';
import Reports from './pages/Reports';
import Transactions from './pages/Transactions';
import __Layout from './Layout.jsx';

export const PAGES = {
    "Accounts":     Accounts,
    "Goals":        Goals,
    "Home":         Home,
    "Profile":      Profile,
    "Reports":      Reports,
    "Transactions": Transactions,
}

export const pagesConfig = {
    mainPage: "Home",
    Pages: PAGES,
    Layout: __Layout,
};