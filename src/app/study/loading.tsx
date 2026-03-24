import { Loader2 } from "lucide-react"

export default function StudyLoading() {
  return (
    <div className="mx-auto flex h-[80vh] w-full max-w-4xl flex-col items-center justify-center">
      <div className="flex flex-col items-center space-y-8 animate-in fade-in zoom-in duration-700">
        <div className="relative flex h-28 w-28 items-center justify-center rounded-[2.5rem] bg-gradient-to-tr from-blue-600/20 to-emerald-500/20 shadow-[0_0_80px_rgba(59,130,246,0.15)] border border-white/10 backdrop-blur-md">
          <div className="absolute inset-0 rounded-[2.5rem] bg-blue-500/10 animate-pulse"></div>
          <Loader2 className="h-12 w-12 animate-spin text-blue-400 drop-shadow-lg relative z-10" />
        </div>
        
        <div className="space-y-3 text-center">
          <h3 className="text-2xl font-black tracking-tight text-white drop-shadow-sm">进入学习模式...</h3>
          <p className="text-sm font-medium text-zinc-400 max-w-sm mx-auto">
            正在调度引擎并载入你的个人学习进度
          </p>
        </div>
        
        <div className="h-1.5 w-48 overflow-hidden rounded-full bg-white/5">
          <div className="h-full w-1/2 rounded-full bg-gradient-to-r from-blue-500 to-emerald-400 animate-[pulse_1.5s_ease-in-out_infinite] shadow-[0_0_10px_rgba(59,130,246,0.5)]"></div>
        </div>
      </div>
    </div>
  )
}
