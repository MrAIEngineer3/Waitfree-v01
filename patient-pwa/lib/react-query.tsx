'use client'

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ReactQueryDevtools } from '@tanstack/react-query-devtools'
import { useState } from 'react'

export function ReactQueryProvider({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(() => new QueryClient({
    defaultOptions: {
      queries: {
        // Data considered fresh for 5 seconds
        staleTime: 5 * 1000,
        // Cache data for 10 minutes before garbage collection
        gcTime: 10 * 60 * 1000,
        // Refetch when window regains focus
        refetchOnWindowFocus: true,
        // Refetch when reconnecting to network
        refetchOnReconnect: true,
        // Retry failed requests once
        retry: 1,
      },
      mutations: {
        // Retry failed mutations once
        retry: 1,
      },
    },
  }))

  return (
    <QueryClientProvider client={queryClient}>
      {children}
      {/* DevTools only in development */}
      {process.env.NODE_ENV === 'development' && (
        <ReactQueryDevtools initialIsOpen={false} />
      )}
    </QueryClientProvider>
  )
}
