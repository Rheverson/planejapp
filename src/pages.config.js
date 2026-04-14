import { lazy } from 'react';
import __Layout from './Layout.jsx';

const Accounts     = lazy(() => import('./pages/Accounts'));
const Goals        = lazy(() => import('./pages/Goals'));
const Home         = lazy(() => import('./pages/Home'));
const Profile      = lazy(() => import('./pages/Profile'));
const Reports      = lazy(() => import('./pages/Reports'));
const Transactions = lazy(() => import('./pages/Transactions'));
const Referrals    = lazy(() => import('./pages/Referrals'));
const AIInsights   = lazy(() => import('./pages/AIInsights'));
const PlanPage     = lazy(() => import('./pages/PlanPage'));

export const PAGES = {
    "Accounts":     Accounts,
    "Goals":        Goals,
    "Home":         Home,
    "Profile":      Profile,
    "Reports":      Reports,
    "Transactions": Transactions,
    "Referrals":    Referrals,
    "AIInsights":   AIInsights,
    "PlanPage":     PlanPage,
}

export const pagesConfig = {
    mainPage: "Home",
    Pages: PAGES,
    Layout: __Layout,
};