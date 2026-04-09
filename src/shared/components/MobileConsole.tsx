'use client'

import { useEffect, useState } from 'react'

export function MobileConsole() {
  const [logs, setLogs] = useState<string[]>([])
  const [isVisible, setIsVisible] = useState(false)

  useEffect(() => {
    // Only show on mobile
    const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent)
    if (!isMobile) return

    // Intercept console methods
    const originalLog = console.log
    const originalError = console.error
    const originalWarn = console.warn

    console.log = (...args) => {
      originalLog(...args)
      setLogs(prev => [...prev.slice(-50), `[LOG] ${args.join(' ')}`])
    }

    console.error = (...args) => {
      originalError(...args)
      setLogs(prev => [...prev.slice(-50), `[ERROR] ${args.join(' ')}`])
    }

    console.warn = (...args) => {
      originalWarn(...args)
      setLogs(prev => [...prev.slice(-50), `[WARN] ${args.join(' ')}`])
    }

    return () => {
      console.log = originalLog
      console.error = originalError
      console.warn = originalWarn
    }
  }, [])

  // Only render on mobile
  if (typeof window === 'undefined') return null
  const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent)
  if (!isMobile) return null

  return (
    <>
      <button
        onClick={() => setIsVisible(!isVisible)}
        className="fixed bottom-4 right-4 z-[9999] bg-blue-600 text-white px-4 py-2 rounded-full shadow-lg text-sm font-medium"
      >
        {isVisible ? '隱藏 Console' : '顯示 Console'}
      </button>
      
      {isVisible && (
        <div className="fixed bottom-20 left-4 right-4 z-[9999] bg-black/95 text-green-400 p-4 rounded-lg shadow-2xl max-h-[50vh] overflow-y-auto font-mono text-xs">
          <div className="flex justify-between items-center mb-2 pb-2 border-b border-gray-700">
            <span className="text-white font-bold">Mobile Console</span>
            <button
              onClick={() => setLogs([])}
              className="text-red-400 hover:text-red-300 text-xs"
            >
              清除
            </button>
          </div>
          {logs.length === 0 ? (
            <div className="text-gray-500">等待日誌...</div>
          ) : (
            logs.map((log, i) => (
              <div
                key={i}
                className={`py-1 border-b border-gray-800 ${
                  log.includes('[ERROR]') ? 'text-red-400' :
                  log.includes('[WARN]') ? 'text-yellow-400' :
                  'text-green-400'
                }`}
              >
                {log}
              </div>
            ))
          )}
        </div>
      )}
    </>
  )
}
