'use client'

import {
  useRef,
  useState,
  type KeyboardEvent,
  type MouseEvent,
  type PointerEvent,
  type RefObject,
} from 'react'
import { flushSync } from 'react-dom'

import {
  DOCK_ARROW_KEYS,
  getAdjacentPlacement,
  getNearestPlacement,
  type DockArrowKey,
  type DockPlacement,
  type Point,
} from './corner-snap.utils'
import { morphDock } from './dock-morph'

export type DockMoveMethod = 'drag' | 'keyboard'

interface CornerDragProps {
  onPointerDown: (event: PointerEvent<HTMLElement>) => void
  onPointerMove: (event: PointerEvent<HTMLElement>) => void
  onPointerUp: (event: PointerEvent<HTMLElement>) => void
  onPointerCancel: (event: PointerEvent<HTMLElement>) => void
  onClickCapture: (event: MouseEvent<HTMLElement>) => void
  onKeyDown: (event: KeyboardEvent<HTMLElement>) => void
}

interface PointerSample extends Point {
  time: number
}

interface DragSession {
  pointerId: number
  start: Point
  base: Point
  offset: Point
  startRect: DOMRect
  isDragging: boolean
  samples: PointerSample[]
}

const settle = ({ target, offset }: { target: HTMLElement; offset: Point }) => {
  const isInstant =
    (offset.x === 0 && offset.y === 0) ||
    window.matchMedia('(prefers-reduced-motion: reduce)').matches

  if (isInstant) {
    target.style.transition = ''
    target.style.translate = ''
    return
  }

  target.style.transition = 'none'
  target.style.translate = `${offset.x}px ${offset.y}px`
  // force reflow so the transition starts from the offset
  target.getBoundingClientRect()
  target.style.transition = 'translate 300ms cubic-bezier(0.34, 1.3, 0.64, 1)'
  target.style.translate = '0px 0px'

  const handleTransitionEnd = (event: TransitionEvent) => {
    if (event.target !== target || event.propertyName !== 'translate') return
    target.removeEventListener('transitionend', handleTransitionEnd)
    target.style.transition = ''
    target.style.translate = ''
  }
  target.addEventListener('transitionend', handleTransitionEnd)
}

const readTranslate = (target: HTMLElement): Point => {
  const [x = 0, y = 0] = (getComputedStyle(target).translate ?? '')
    .split(' ')
    .map(parseFloat)
    .filter((value) => !Number.isNaN(value))
  return { x, y }
}

const recordSample = ({ samples, x, y }: { samples: PointerSample[]; x: number; y: number }) => {
  const time = performance.now()
  const last = samples.at(-1)
  if (last && time - last.time < 10) return
  samples.push({ x, y, time })
  if (samples.length > 6) samples.shift()
}

const getVelocity = (samples: PointerSample[]): Point => {
  const now = performance.now()
  const recent = samples.filter((sample) => now - sample.time <= 100)
  const first = recent[0]
  const last = recent.at(-1)
  if (!first || !last || last.time === first.time) return { x: 0, y: 0 }

  const seconds = (last.time - first.time) / 1000
  return { x: (last.x - first.x) / seconds, y: (last.y - first.y) / seconds }
}

const hasOwnGestures = (target: EventTarget): boolean =>
  target instanceof Element &&
  target.closest('input, textarea, select, [contenteditable]:not([contenteditable="false"])') !==
    null

const isDockArrowKey = (key: string): key is DockArrowKey =>
  DOCK_ARROW_KEYS.some((arrowKey) => arrowKey === key)

export const useCornerDrag = ({
  targetRef,
  placement,
  isDisabled,
  onPlacementChange,
}: {
  targetRef: RefObject<HTMLElement | null>
  placement: DockPlacement
  isDisabled: boolean
  onPlacementChange: (args: { placement: DockPlacement; method: DockMoveMethod }) => void
}): { dragProps: CornerDragProps; isDragging: boolean } => {
  const dragRef = useRef<DragSession | null>(null)
  const didDragRef = useRef(false)
  const [isDragging, setIsDragging] = useState(false)

  const moveTo = ({ next, method }: { next: DockPlacement; method: DockMoveMethod }) => {
    const target = targetRef.current
    if (!target) return
    const from = target.getBoundingClientRect()
    const isReshape = (next === 'center') !== (placement === 'center')
    flushSync(() => onPlacementChange({ placement: next, method }))

    target.style.transition = 'none'
    target.style.translate = ''
    // the island and the corner dock have different shapes, so morph between them
    if (isReshape) {
      target.style.transition = ''
      morphDock({ from, dock: target })
      return
    }
    const to = target.getBoundingClientRect()
    settle({ target, offset: { x: from.left - to.left, y: from.top - to.top } })
  }

  const handlePointerDown = (event: PointerEvent<HTMLElement>) => {
    const target = targetRef.current
    didDragRef.current = false
    if (isDisabled || event.button !== 0 || !target || hasOwnGestures(event.target)) return

    // a press during a snap starts from the current translate
    const base = readTranslate(target)
    target.style.transition = 'none'
    target.style.translate = base.x === 0 && base.y === 0 ? '' : `${base.x}px ${base.y}px`
    const point = { x: event.clientX, y: event.clientY }
    dragRef.current = {
      pointerId: event.pointerId,
      start: point,
      base,
      offset: base,
      startRect: target.getBoundingClientRect(),
      isDragging: false,
      samples: [{ ...point, time: performance.now() }],
    }
  }

  const handlePointerMove = (event: PointerEvent<HTMLElement>) => {
    const drag = dragRef.current
    const target = targetRef.current
    if (!drag || !target || event.pointerId !== drag.pointerId) return

    // the pointer released before capture, so no pointerup event occurs
    if (event.buttons === 0) {
      handlePointerCancel(event)
      return
    }

    const delta = { x: event.clientX - drag.start.x, y: event.clientY - drag.start.y }
    if (!drag.isDragging) {
      if (Math.hypot(delta.x, delta.y) < 5) return
      drag.isDragging = true
      event.currentTarget.setPointerCapture(event.pointerId)
      target.dataset.dragging = ''
      document.body.style.userSelect = 'none'
      setIsDragging(true)
    }

    drag.offset = { x: drag.base.x + delta.x, y: drag.base.y + delta.y }
    target.style.translate = `${drag.offset.x}px ${drag.offset.y}px`
    recordSample({ samples: drag.samples, x: event.clientX, y: event.clientY })
  }

  const handlePointerUp = (event: PointerEvent<HTMLElement>) => {
    const drag = endDrag(event)
    const target = targetRef.current
    if (!drag || !target) return
    // a press without a drag during a snap continues the snap
    if (!drag.isDragging) {
      settle({ target, offset: drag.offset })
      return
    }

    // startRect already includes base
    const next = getNearestPlacement({
      point: {
        x: drag.startRect.left + drag.startRect.width / 2 + drag.offset.x - drag.base.x,
        y: drag.startRect.top + drag.startRect.height / 2 + drag.offset.y - drag.base.y,
      },
      velocity: getVelocity(drag.samples),
      viewport: {
        width: document.documentElement.clientWidth,
        height: document.documentElement.clientHeight,
      },
    })

    if (next === placement) {
      settle({ target, offset: drag.offset })
      return
    }
    moveTo({ next, method: 'drag' })
  }

  const handlePointerCancel = (event: PointerEvent<HTMLElement>) => {
    const drag = endDrag(event)
    const target = targetRef.current
    if (!drag || !target) return
    settle({ target, offset: drag.offset })
  }

  const endDrag = (event: PointerEvent<HTMLElement>): DragSession | null => {
    const drag = dragRef.current
    if (!drag || event.pointerId !== drag.pointerId) return null
    dragRef.current = null
    didDragRef.current = drag.isDragging
    setIsDragging(false)
    delete targetRef.current?.dataset.dragging
    document.body.style.removeProperty('user-select')
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
    return drag
  }

  const handleClickCapture = (event: MouseEvent<HTMLElement>) => {
    if (!didDragRef.current) return
    didDragRef.current = false
    event.preventDefault()
    event.stopPropagation()
  }

  const handleKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (isDisabled || !isDockArrowKey(event.key) || hasOwnGestures(event.target)) return
    event.preventDefault()
    const next = getAdjacentPlacement({ placement, key: event.key })
    if (next !== placement) moveTo({ next, method: 'keyboard' })
  }

  return {
    dragProps: {
      onPointerDown: handlePointerDown,
      onPointerMove: handlePointerMove,
      onPointerUp: handlePointerUp,
      onPointerCancel: handlePointerCancel,
      onClickCapture: handleClickCapture,
      onKeyDown: handleKeyDown,
    },
    isDragging,
  }
}
