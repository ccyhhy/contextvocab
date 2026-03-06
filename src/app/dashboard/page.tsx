import { getDashboardStats, getRecentActivity } from "./actions"
import { requirePageUser } from "@/lib/supabase/user"
import DashboardClient from "./dashboard-client"

export default async function DashboardPage() {
  await requirePageUser()
  const [stats, recentActivity] = await Promise.all([
    getDashboardStats(),
    getRecentActivity(10),
  ])

  return <DashboardClient stats={stats} recentActivity={recentActivity} />
}
