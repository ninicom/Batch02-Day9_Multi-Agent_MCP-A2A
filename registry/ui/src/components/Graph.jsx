import { useState, useEffect, useRef } from 'react';
import {
  ReactFlow,
  useNodesState,
  useEdgesState,
  MarkerType,
  Background,
  Controls,
  Handle,
  Position,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';

const CustomNode = ({ data }) => {
  let extraClass = '';
  if (data.isActive) extraClass = 'node-active';
  else if (data.isOffline) extraClass = 'node-offline';
  else if (data.isWarning) extraClass = 'node-warning';
  else if (data.isSpecial) extraClass = 'node-special';

  return (
    <div className={`custom-node ${extraClass}`} style={{ opacity: data.isOffline ? 0.6 : 1 }}>
      {/* Target Handles (IN) */}
      <Handle type="target" position={Position.Top} id="top-in" style={{ left: '35%' }} className="handle-hidden" />
      <Handle type="target" position={Position.Bottom} id="bottom-in" style={{ left: '65%' }} className="handle-hidden" />
      <Handle type="target" position={Position.Left} id="left-in" style={{ top: '35%' }} className="handle-hidden" />
      <Handle type="target" position={Position.Right} id="right-in" style={{ top: '65%' }} className="handle-hidden" />
      
      <div>{data.label}</div>
      {data.isOffline && <div className="text-[10px] text-red-400 mt-1 uppercase">Offline</div>}
      
      {/* Source Handles (OUT) */}
      <Handle type="source" position={Position.Top} id="top-out" style={{ left: '65%' }} className="handle-hidden" />
      <Handle type="source" position={Position.Bottom} id="bottom-out" style={{ left: '35%' }} className="handle-hidden" />
      <Handle type="source" position={Position.Left} id="left-out" style={{ top: '65%' }} className="handle-hidden" />
      <Handle type="source" position={Position.Right} id="right-out" style={{ top: '35%' }} className="handle-hidden" />
    </div>
  );
};

const nodeTypes = { custom: CustomNode };

const initialNodes = [
  { id: 'User', type: 'custom', position: { x: 50, y: 250 }, data: { label: 'User', isActive: false } },
  { id: 'customer-agent', type: 'custom', position: { x: 250, y: 250 }, data: { label: 'Customer Agent', isActive: false } },
  { id: 'law-agent', type: 'custom', position: { x: 500, y: 250 }, data: { label: 'Law Agent', isActive: false } },
  { id: 'tax-agent', type: 'custom', position: { x: 800, y: 150 }, data: { label: 'Tax Agent', isActive: false } },
  { id: 'compliance-agent', type: 'custom', position: { x: 800, y: 350 }, data: { label: 'Compliance Agent', isActive: false } },
  { id: 'registry', type: 'custom', position: { x: 500, y: 50 }, data: { label: 'Registry', isWarning: true } },
  { id: 'LLM', type: 'custom', position: { x: 500, y: 450 }, data: { label: 'LLM (OpenRouter)', isSpecial: true } },
];

export default function Graph() {
  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const [logs, setLogs] = useState([]);
  const [selectedLog, setSelectedLog] = useState(null);
  const wsRef = useRef(null);
  
  const activeTasks = useRef({});

  const normalizeId = (id) => {
    if (id === 'agent') return 'law-agent'; 
    return initialNodes.find(n => n.id.toLowerCase() === id.toLowerCase())?.id || id;
  };

  const getHandles = (sourceId, targetId) => {
    const s = initialNodes.find(n => n.id === sourceId);
    const t = initialNodes.find(n => n.id === targetId);
    if (!s || !t) return { sHandle: 'right-out', tHandle: 'left-in' };
    
    if (t.position.y < s.position.y - 50) return { sHandle: 'top-out', tHandle: 'bottom-in' };
    if (t.position.y > s.position.y + 50) return { sHandle: 'bottom-out', tHandle: 'top-in' };
    if (t.position.x < s.position.x) return { sHandle: 'left-out', tHandle: 'right-in' };
    return { sHandle: 'right-out', tHandle: 'left-in' };
  };

  const buildEdge = (sId, tId, isActive, isReply = false, isError = false) => {
    const handles = getHandles(sId, tId);
    // Colors: Error=Red, Ask/Forward=Blue, Reply/Return=Purple, Inactive=Slate
    let color = '#475569';
    if (isError) color = '#ef4444';
    else if (isActive && isReply) color = '#8b5cf6'; // Purple for return path
    else if (isActive) color = '#3b82f6'; // Blue for forward path

    const zIndex = isActive ? 1000 : 0;
    return {
      id: `e-${sId}-${tId}`,
      source: sId,
      target: tId,
      sourceHandle: handles.sHandle,
      targetHandle: handles.tHandle,
      type: 'bezier', // Smooth curve, no zig-zag
      animated: isActive,
      zIndex,
      style: { stroke: color, strokeWidth: isActive ? 3 : 2, opacity: isActive ? 1 : 0.3 },
      markerEnd: { type: MarkerType.ArrowClosed, color },
    };
  };

  useEffect(() => {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/ws/traces`;
    wsRef.current = new WebSocket(wsUrl);

    wsRef.current.onopen = () => {
      setLogs([{ id: Date.now(), system: true, message: 'Connected to Registry WebSocket. Waiting for traces...' }]);
    };

    wsRef.current.onmessage = (event) => {
      const data = JSON.parse(event.data);
      const sId = normalizeId(data.source);
      const tId = normalizeId(data.target);
      const isError = typeof data.message === 'string' && data.message.toLowerCase().includes('unavailable');
      const isReply = data.action === 'reply';
      
      const logEntry = {
        id: Date.now() + Math.random(),
        ...data,
        sourceLabel: sId,
        targetLabel: tId,
        isError
      };
      setLogs(prev => [...prev, logEntry]);

      // State Logic Update
      if (data.action === 'ask') {
        activeTasks.current[tId] = sId;
      } else if (isReply) {
        delete activeTasks.current[sId]; // sId finished working for tId
      }

      // Update Nodes
      setNodes(nds => nds.map(node => {
        let newData = { ...node.data };
        if (isError && node.id === tId) {
          newData.isOffline = true;
          newData.isActive = false;
        } else {
          newData.isActive = !!activeTasks.current[node.id];
          if (isReply && node.id === tId) newData.isActive = true; 
          if ((tId === 'LLM' || tId === 'registry') && node.id === tId) newData.isActive = true;
        }
        return { ...node, data: newData };
      }));

      // Auto turn off temporary glows
      if (isReply || tId === 'LLM' || tId === 'registry') {
        const glowTarget = isReply ? tId : tId;
        setTimeout(() => {
          setNodes(nds => nds.map(n => {
            if (n.id === glowTarget && !activeTasks.current[glowTarget]) {
              return { ...n, data: { ...n.data, isActive: false } };
            }
            return n;
          }));
        }, 1500);
      }

      // Dynamic Edges logic
      setEdges(eds => {
        let newEds = [...eds];
        
        // 1. Activate the current trace's edge
        const activeEdge = buildEdge(sId, tId, true, isReply, isError);
        const idx = newEds.findIndex(e => e.id === activeEdge.id);
        if (idx >= 0) newEds[idx] = activeEdge;
        else newEds.push(activeEdge);

        // 2. If this is a reply, IMMEDIATELY turn off the forward edge!
        if (isReply) {
          const forwardEdgeId = `e-${tId}-${sId}`;
          const fIdx = newEds.findIndex(e => e.id === forwardEdgeId);
          if (fIdx >= 0) {
            newEds[fIdx] = buildEdge(tId, sId, false, false, false);
          }
        }

        return newEds;
      });

      // Deactivate edge animation after a delay, unless it's an ongoing task
      setTimeout(() => {
        setEdges(eds => eds.map(e => {
          if (e.id === `e-${sId}-${tId}`) {
            const isOngoingTask = activeTasks.current[tId] === sId;
            if (!isOngoingTask) {
              return buildEdge(sId, tId, false, isReply, isError); 
            }
          }
          return e;
        }));
      }, 2000);
    };

    return () => { if (wsRef.current) wsRef.current.close(); };
  }, [setNodes, setEdges]);

  // Initial structure edges (faded out), with both forward and backward paths pre-rendered
  useEffect(() => {
    const staticPairs = [
      ['User', 'customer-agent'],
      ['customer-agent', 'law-agent'],
      ['law-agent', 'tax-agent'],
      ['law-agent', 'compliance-agent'],
      ['customer-agent', 'registry'],
      ['law-agent', 'registry'],
      ['tax-agent', 'registry'],
      ['compliance-agent', 'registry'],
      ['law-agent', 'LLM'],
      ['tax-agent', 'LLM'],
      ['compliance-agent', 'LLM'],
    ];
    
    let initialEdges = [];
    staticPairs.forEach(pair => {
      initialEdges.push(buildEdge(pair[0], pair[1], false, false)); // Forward
      initialEdges.push(buildEdge(pair[1], pair[0], false, true));  // Return
    });
    setEdges(initialEdges);
  }, [setEdges]);

  return (
    <div className="dashboard-container">
      <div className="graph-wrapper">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          nodeTypes={nodeTypes}
          fitView
          colorMode="dark"
        >
          <Background color="#334155" gap={16} />
          <Controls className="react-flow__controls-custom" />
        </ReactFlow>
      </div>

      <div className="logs-panel">
        <div className="logs-header">
          Live Traces
        </div>
        <div className="logs-list">
          {logs.map((log) => (
            <div 
              key={log.id} 
              onClick={() => !log.system && setSelectedLog(selectedLog?.id === log.id ? null : log)}
              className={`log-entry ${log.system ? 'log-system' : 'log-trace'}`}
            >
              {!log.system && (
                <>
                  <div className="log-title">
                    <span>{log.sourceLabel} <span className="arrow">➜</span> {log.targetLabel}</span>
                  </div>
                  <div className="log-action">[{log.action}]</div>
                  
                  {selectedLog?.id === log.id ? (
                    <div className="log-details-expanded">
                      <pre>
                        {typeof log.message === 'string' ? log.message : JSON.stringify(log.message, null, 2)}
                      </pre>
                    </div>
                  ) : (
                    <div className="log-preview">
                      {typeof log.message === 'string' ? log.message : JSON.stringify(log.message)}
                    </div>
                  )}
                </>
              )}
              {log.system && log.message}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
