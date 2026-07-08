import { useEffect, useMemo, useRef } from 'react'
import { Network, type IdType, type Options } from 'vis-network/standalone'
import 'vis-network/styles/vis-network.css'
import type {
  LLMTraceChainProps,
  SelectedNodeChangeHandler,
  TraceGraphInput,
} from './types'
import {
  buildObservationGraphData,
  CHAIN_END_NODE_ID,
  CHAIN_START_NODE_ID,
  getFirstGraphObservation,
  getGraphObservations,
  graphObservationToTreeNode,
} from './utils'

interface GraphViewProps {
  graph?: TraceGraphInput
  selectedNodeId?: string
  onSelectedNodeChange?: SelectedNodeChangeHandler
  onNodeClick?: LLMTraceChainProps['onNodeClick']
}

export function GraphView({
  graph,
  selectedNodeId,
  onSelectedNodeChange,
  onNodeClick,
}: GraphViewProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const networkRef = useRef<Network | null>(null)
  const selectedNodeIdRef = useRef<string | undefined>(selectedNodeId)
  const defaultSelectedNodeIdRef = useRef<string | undefined>(undefined)
  const suppressNextClickRef = useRef(false)
  const observations = useMemo(() => getGraphObservations(graph), [graph])
  const defaultSelectedNodeId = useMemo(
    () => getFirstGraphObservation(graph)?.id,
    [graph]
  )
  const observationGraphData = useMemo(
    () => buildObservationGraphData(observations),
    [observations]
  )

  useEffect(() => {
    selectedNodeIdRef.current = selectedNodeId
  }, [selectedNodeId])

  useEffect(() => {
    defaultSelectedNodeIdRef.current = defaultSelectedNodeId
  }, [defaultSelectedNodeId])

  useEffect(() => {
    if (!containerRef.current || !observationGraphData.nodes.length) return

    const options: Options = {
      autoResize: true,
      layout: {
        hierarchical: {
          enabled: true,
          direction: 'UD',
          sortMethod: 'directed',
          nodeSpacing: 190,
          levelSeparation: 105,
          treeSpacing: 220,
        },
      },
      physics: false,
      interaction: {
        dragNodes: true,
        dragView: true,
        hover: true,
        keyboard: false,
        multiselect: false,
        navigationButtons: false,
        selectable: true,
        zoomView: true,
      },
      nodes: {
        borderWidth: 1,
        borderWidthSelected: 2,
        shape: 'box',
        widthConstraint: { minimum: 120, maximum: 230 },
        heightConstraint: { minimum: 42 },
      } as NonNullable<Options['nodes']>,
      edges: {
        arrows: {
          to: {
            enabled: true,
            scaleFactor: 0.7,
          },
        },
        color: {
          color: '#94a3b8',
          highlight: '#2563eb',
          hover: '#2563eb',
        },
        width: 1.5,
        selectionWidth: 2,
        smooth: {
          enabled: true,
          type: 'cubicBezier',
          forceDirection: 'vertical',
          roundness: 0.35,
        },
      },
    }

    const network = new Network(
      containerRef.current,
      {
        nodes: observationGraphData.nodes,
        edges: observationGraphData.edges,
      },
      options
    )

    networkRef.current = network

    const restoreGraphSelection = () => {
      const currentNodeId = selectedNodeIdRef.current
      const fallbackNodeId = defaultSelectedNodeIdRef.current
      const nodeId =
        currentNodeId &&
        observationGraphData.observationsById.has(currentNodeId)
          ? currentNodeId
          : fallbackNodeId

      if (!nodeId || !observationGraphData.observationsById.has(nodeId)) return

      network.selectNodes([nodeId], true)
    }

    const handleSelectNode = (params?: { nodes?: IdType[] }) => {
      const nodeId = params?.nodes?.[0]

      if (
        nodeId === CHAIN_START_NODE_ID ||
        nodeId === CHAIN_END_NODE_ID
      ) {
        suppressNextClickRef.current = true
        restoreGraphSelection()
        return
      }

      if (typeof nodeId !== 'string') {
        restoreGraphSelection()
        return
      }

      onSelectedNodeChange?.(nodeId)
    }

    const handleClick = (params?: {
      nodes?: IdType[]
      event?:
        | globalThis.MouseEvent
        | {
            srcEvent?: globalThis.MouseEvent
          }
    }) => {
      if (suppressNextClickRef.current) {
        suppressNextClickRef.current = false
        restoreGraphSelection()
        return
      }

      const nodeId = params?.nodes?.[0]

      if (
        typeof nodeId !== 'string' ||
        nodeId === CHAIN_START_NODE_ID ||
        nodeId === CHAIN_END_NODE_ID
      ) {
        restoreGraphSelection()
        return
      }

      const observation = observationGraphData.observationsById.get(nodeId)

      if (!observation) return

      const rawEvent = params?.event
      const event =
        rawEvent instanceof globalThis.MouseEvent
          ? rawEvent
          : rawEvent?.srcEvent instanceof globalThis.MouseEvent
            ? rawEvent.srcEvent
            : new globalThis.MouseEvent('click')

      onSelectedNodeChange?.(nodeId)
      onNodeClick?.(graphObservationToTreeNode(observation), {
        depth: Math.max(
          (observationGraphData.levelsById.get(nodeId) ?? 1) - 1,
          0
        ),
        hasChildren: Boolean(
          observationGraphData.childIdsById.get(nodeId)?.length
        ),
        isOpen: true,
        event,
      })
    }

    network.on('selectNode', handleSelectNode)
    network.on('click', handleClick)
    network.once('stabilizationIterationsDone', () => {
      network.fit({
        animation: {
          duration: 250,
          easingFunction: 'easeInOutQuad',
        },
      })
    })
    window.setTimeout(() => {
      network.fit({
        animation: {
          duration: 250,
          easingFunction: 'easeInOutQuad',
        },
      })
    }, 0)

    return () => {
      network.off('selectNode', handleSelectNode)
      network.off('click', handleClick)
      network.destroy()
      if (networkRef.current === network) {
        networkRef.current = null
      }
    }
  }, [observationGraphData, onNodeClick, onSelectedNodeChange])

  useEffect(() => {
    if (!networkRef.current) return

    const nodeId =
      selectedNodeId && observationGraphData.observationsById.has(selectedNodeId)
        ? selectedNodeId
        : defaultSelectedNodeId

    if (nodeId && observationGraphData.observationsById.has(nodeId)) {
      networkRef.current.selectNodes([nodeId], true)
      onSelectedNodeChange?.(nodeId)
      return
    }
  }, [
    defaultSelectedNodeId,
    observationGraphData.observationsById,
    onSelectedNodeChange,
    selectedNodeId,
  ])

  if (!observations.length) {
    return (
      <div className='flex flex-1 items-center justify-center text-[13px] text-slate-400'>
        No graph data
      </div>
    )
  }

  return (
    <div className='min-h-0 flex-1 bg-white'>
      <div className='border-border flex items-center justify-between border-b bg-slate-50 px-4 py-2'>
        <span className='text-[11px] font-medium text-slate-500'>
          Graph
        </span>
        <span className='text-[11px] text-slate-400'>
          {observations.length} observations
        </span>
      </div>
      <div ref={containerRef} className='h-[calc(100%-33px)] w-full' />
    </div>
  )
}
