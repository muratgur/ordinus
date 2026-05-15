import { useCallback, useEffect, useRef } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import type { WorkboardData } from '@shared/contracts'
import { appRoutePaths } from './routes'
import { notify, notificationIds } from '@renderer/lib/notifications'
import {
  evaluateWorkboardNotifications,
  getWorkboardPlanReadyEvent,
  getWorkboardPlanSignature,
  seedSeenWorkboardNotifications,
  type NotificationPolicyEvent
} from '@renderer/lib/workboard-notification-policy'
import type { WorkboardDraftReviewState } from '@renderer/screens/workboard-draft-review'

export function NotificationPolicyBridge({
  workboardDraftReview
}: {
  workboardDraftReview: WorkboardDraftReviewState
}): null {
  const location = useLocation()
  const navigate = useNavigate()
  const currentPathRef = useRef(location.pathname)
  const workboardDataRef = useRef<WorkboardData | null>(null)
  const seenRef = useRef<Set<string>>(new Set())
  const refreshTimerRef = useRef<number | null>(null)
  const planSignatureRef = useRef<string | null>(null)

  useEffect(() => {
    currentPathRef.current = location.pathname
  }, [location.pathname])

  const openWorkboard = useCallback(() => {
    navigate(appRoutePaths.workboard)
  }, [navigate])

  const showPolicyEvent = useCallback(
    (event: NotificationPolicyEvent) => {
      const input = {
        id: event.id,
        title: event.title,
        description: event.description,
        duration: event.duration,
        action: {
          label: event.actionLabel,
          onClick: openWorkboard
        }
      }

      if (event.kind === 'error') {
        notify.error(input)
      } else if (event.kind === 'attention') {
        notify.attention(input)
      } else {
        notify.success(input)
      }
      seenRef.current.add(event.dedupeKey)
    },
    [openWorkboard]
  )

  const applyWorkboardData = useCallback(
    (nextData: WorkboardData) => {
      const previousData = workboardDataRef.current
      if (!previousData) {
        workboardDataRef.current = nextData
        seedSeenWorkboardNotifications(nextData, seenRef.current)
        return
      }

      const events = evaluateWorkboardNotifications({
        previousData,
        nextData,
        currentPath: currentPathRef.current,
        seen: seenRef.current
      })
      workboardDataRef.current = nextData
      events.forEach(showPolicyEvent)
    },
    [showPolicyEvent]
  )

  const refreshWorkboardData = useCallback(async () => {
    try {
      const nextData = await window.ordinus.workboard.list()
      applyWorkboardData(nextData)
    } catch {
      // Notification policy should never interrupt the primary UI.
    }
  }, [applyWorkboardData])

  useEffect(() => {
    let mounted = true

    async function loadBaseline(): Promise<void> {
      try {
        const nextData = await window.ordinus.workboard.list()
        if (!mounted) return
        applyWorkboardData(nextData)
      } catch {
        // The screen-level loader will show user-visible errors when needed.
      }
    }

    void loadBaseline()

    return () => {
      mounted = false
    }
  }, [applyWorkboardData])

  useEffect(() => {
    return window.ordinus.observability.onRunChanged((snapshot) => {
      if (snapshot.sourceSurface !== 'workboard') return
      if (refreshTimerRef.current !== null) {
        window.clearTimeout(refreshTimerRef.current)
      }
      refreshTimerRef.current = window.setTimeout(() => {
        refreshTimerRef.current = null
        void refreshWorkboardData()
      }, 300)
    })
  }, [refreshWorkboardData])

  useEffect(() => {
    return () => {
      if (refreshTimerRef.current !== null) {
        window.clearTimeout(refreshTimerRef.current)
      }
    }
  }, [])

  useEffect(() => {
    const plan = workboardDraftReview.plan
    const nextSignature = plan ? getWorkboardPlanSignature(plan) : null
    const previousSignature = planSignatureRef.current
    planSignatureRef.current = nextSignature

    if (!plan) {
      notify.dismiss(notificationIds.workboardPlanReady)
      return
    }

    if (previousSignature === nextSignature) return

    const event = getWorkboardPlanReadyEvent(plan)
    if (currentPathRef.current === appRoutePaths.workboard) {
      seenRef.current.add(event.dedupeKey)
      return
    }

    if (!seenRef.current.has(event.dedupeKey)) {
      showPolicyEvent(event)
    }
  }, [showPolicyEvent, workboardDraftReview.plan])

  return null
}
