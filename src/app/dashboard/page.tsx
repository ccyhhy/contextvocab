import { getDashboardStats, getRecentActivity } from "./actions"
import DashboardClient from "./dashboard-client"

export default async function DashboardPage() {
  const [stats, recentActivity] = await Promise.all([
    getDashboardStats(),
    getRecentActivity(10),
  ])

  return <DashboardClient stats={stats} recentActivity={recentActivity} />
}
