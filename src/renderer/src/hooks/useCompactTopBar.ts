import { useState, useEffect } from 'react'

export function useCompactTopBar(breakpoint = 1360): boolean {
  const [compact, setCompact] = useState(() => window.innerWidth < breakpoint)

  useEffect(() => {
    const onResize = (): void => setCompact(window.innerWidth < breakpoint)
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [breakpoint])
  return compact
}
