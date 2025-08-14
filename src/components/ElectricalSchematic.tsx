"use client";

import React, { useState, useRef, useCallback, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { CheckCircle, XCircle, RotateCcw, Lightbulb } from 'lucide-react';

interface ElectricalBox {
  id: string;
  type: 'outlet' | 'switch' | 'light' | 'junction' | 'power_input';
  position: { x: number; y: number };
  label: string;
  voltage?: string;
  amperage?: string;
  requiredConnections: string[];
}

interface UserConnection {
  id: string;
  from: string;
  to: string;
  isCorrect: boolean;
}

interface DragState {
  isDragging: boolean;
  startBox: string | null;
  currentPos: { x: number; y: number } | null;
}

const ElectricalSchematic: React.FC = () => {
  const [selectedBox, setSelectedBox] = useState<string | null>(null);
  const [userConnections, setUserConnections] = useState<UserConnection[]>([]);
  const [dragState, setDragState] = useState<DragState>({
    isDragging: false,
    startBox: null,
    currentPos: null
  });
  const [trainingMode, setTrainingMode] = useState(true);
  const [showHints, setShowHints] = useState(false);
  const [score, setScore] = useState({ correct: 0, total: 0 });
  const svgRef = useRef<SVGSVGElement>(null);

  // Define the 9 electrical boxes in a 3x3 training board layout with power input
  const electricalBoxes: ElectricalBox[] = [
    // Top row (3 boxes)
    { id: 'power_in', type: 'power_input', position: { x: 50, y: 50 }, label: 'Power Input', voltage: '120V', amperage: '20A', requiredConnections: ['junction1', 'outlet1'] },
    { id: 'junction1', type: 'junction', position: { x: 200, y: 50 }, label: 'Junction Box 1', requiredConnections: ['power_in', 'switch1', 'light1'] },
    { id: 'outlet1', type: 'outlet', position: { x: 350, y: 50 }, label: 'GFCI Outlet', voltage: '120V', amperage: '20A', requiredConnections: ['power_in', 'outlet2'] },

    // Middle row (3 boxes)
    { id: 'switch1', type: 'switch', position: { x: 50, y: 200 }, label: 'Single Pole Switch', requiredConnections: ['junction1', 'light1'] },
    { id: 'junction2', type: 'junction', position: { x: 200, y: 200 }, label: 'Junction Box 2', requiredConnections: ['light1', 'light2', 'outlet2'] },
    { id: 'outlet2', type: 'outlet', position: { x: 350, y: 200 }, label: 'Standard Outlet', voltage: '120V', amperage: '15A', requiredConnections: ['outlet1', 'junction2'] },

    // Bottom row (3 boxes)
    { id: 'light1', type: 'light', position: { x: 50, y: 350 }, label: 'Ceiling Light', voltage: '120V', requiredConnections: ['junction1', 'switch1', 'junction2'] },
    { id: 'light2', type: 'light', position: { x: 200, y: 350 }, label: 'Wall Sconce', voltage: '120V', requiredConnections: ['junction2', 'switch2'] },
    { id: 'switch2', type: 'switch', position: { x: 350, y: 350 }, label: '3-Way Switch', requiredConnections: ['light2'] },
  ];

  // Helper functions
  const getRequiredConnections = () => {
    const allRequired: Array<{ from: string, to: string }> = [];
    electricalBoxes.forEach(box => {
      box.requiredConnections.forEach(connectedId => {
        if (box.id < connectedId) { // Avoid duplicates
          allRequired.push({ from: box.id, to: connectedId });
        }
      });
    });
    return allRequired;
  };

  const isConnectionRequired = (from: string, to: string) => {
    const box1 = electricalBoxes.find(b => b.id === from);
    const box2 = electricalBoxes.find(b => b.id === to);
    return (box1?.requiredConnections.includes(to) ||
      box2?.requiredConnections.includes(from)) || false;
  };

  const addConnection = useCallback((from: string, to: string) => {
    const connectionId = `${from}-${to}`;
    const isCorrect = isConnectionRequired(from, to);

    // Check if connection already exists
    const exists = userConnections.some(conn =>
      (conn.from === from && conn.to === to) ||
      (conn.from === to && conn.to === from)
    );

    if (!exists) {
      const newConnection: UserConnection = {
        id: connectionId,
        from,
        to,
        isCorrect
      };

      setUserConnections(prev => [...prev, newConnection]);

      // Update score
      const allRequired = getRequiredConnections();
      const newCorrect = [...userConnections, newConnection].filter(c => c.isCorrect).length;
      setScore({ correct: newCorrect, total: allRequired.length });
    }
  }, [userConnections]);

  const resetConnections = () => {
    setUserConnections([]);
    setScore({ correct: 0, total: getRequiredConnections().length });
  };

  // Initialize score on component mount
  useEffect(() => {
    const totalConnections = getRequiredConnections().length;
    setScore({ correct: 0, total: totalConnections });
  }, []);

  // Mouse event handlers
  const getSVGPoint = (e: React.MouseEvent<SVGSVGElement>) => {
    if (!svgRef.current) return { x: 0, y: 0 };
    const rect = svgRef.current.getBoundingClientRect();
    const scaleX = 450 / rect.width;
    const scaleY = 450 / rect.height;
    return {
      x: (e.clientX - rect.left) * scaleX,
      y: (e.clientY - rect.top) * scaleY
    };
  };

  const handleBoxMouseDown = (boxId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (trainingMode) {
      setDragState({
        isDragging: true,
        startBox: boxId,
        currentPos: getSVGPoint(e as React.MouseEvent<SVGSVGElement>)
      });
    }
  };

  const handleMouseMove = (e: React.MouseEvent<SVGSVGElement>) => {
    if (dragState.isDragging && trainingMode) {
      setDragState(prev => ({
        ...prev,
        currentPos: getSVGPoint(e)
      }));
    }
  };

  const handleBoxMouseUp = (boxId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (dragState.isDragging && dragState.startBox && dragState.startBox !== boxId && trainingMode) {
      addConnection(dragState.startBox, boxId);
    }
    setDragState({
      isDragging: false,
      startBox: null,
      currentPos: null
    });
  };

  const handleSVGMouseUp = () => {
    setDragState({
      isDragging: false,
      startBox: null,
      currentPos: null
    });
  };

  // SVG symbols for different electrical components
  const renderElectricalSymbol = (box: ElectricalBox) => {
    const { x, y } = box.position;
    const isSelected = selectedBox === box.id;
    const baseColor = isSelected ? '#3b82f6' : '#374151';
    const fillColor = isSelected ? '#dbeafe' : '#f9fafb';

    switch (box.type) {
      case 'power_input':
        return (
          <g key={box.id}>
            <rect x={x - 20} y={y - 15} width="40" height="30" fill={fillColor} stroke={baseColor} strokeWidth="3" rx="5" />
            <text x={x} y={y - 2} textAnchor="middle" fontSize="8" fill={baseColor} fontWeight="bold">120V</text>
            <text x={x} y={y + 8} textAnchor="middle" fontSize="8" fill={baseColor} fontWeight="bold">20A</text>
            {/* Power connection points */}
            <circle cx={x - 12} cy={y} r="3" fill={baseColor} />
            <circle cx={x + 12} cy={y} r="3" fill={baseColor} />
            <line x1={x - 8} y1={y} x2={x + 8} y2={y} stroke={baseColor} strokeWidth="2" />
          </g>
        );

      case 'outlet':
        return (
          <g key={box.id}>
            <circle cx={x} cy={y} r="18" fill={fillColor} stroke={baseColor} strokeWidth="2" />
            <circle cx={x - 6} cy={y - 3} r="2" fill={baseColor} />
            <circle cx={x + 6} cy={y - 3} r="2" fill={baseColor} />
            <rect x={x - 2} y={y + 3} width="4" height="8" fill={baseColor} rx="2" />
          </g>
        );

      case 'switch':
        return (
          <g key={box.id}>
            <circle cx={x} cy={y} r="18" fill={fillColor} stroke={baseColor} strokeWidth="2" />
            <line x1={x - 8} y1={y + 5} x2={x + 4} y2={y - 8} stroke={baseColor} strokeWidth="3" strokeLinecap="round" />
            <circle cx={x - 8} cy={y + 5} r="2" fill={baseColor} />
            <circle cx={x + 8} cy={y + 5} r="2" fill={baseColor} />
          </g>
        );

      case 'light':
        return (
          <g key={box.id}>
            <circle cx={x} cy={y} r="18" fill={fillColor} stroke={baseColor} strokeWidth="2" />
            <circle cx={x} cy={y} r="8" fill="none" stroke={baseColor} strokeWidth="2" />
            <path d={`M ${x - 6} ${y - 6} L ${x + 6} ${y + 6} M ${x - 6} ${y + 6} L ${x + 6} ${y - 6}`} stroke={baseColor} strokeWidth="2" />
          </g>
        );

      case 'junction':
        return (
          <g key={box.id}>
            <rect x={x - 12} y={y - 12} width="24" height="24" fill={fillColor} stroke={baseColor} strokeWidth="2" />
            <circle cx={x} cy={y} r="3" fill={baseColor} />
          </g>
        );

      default:
        return null;
    }
  };

  // Render user-created connections
  const renderUserConnections = () => {
    const connections: JSX.Element[] = [];

    userConnections.forEach(connection => {
      const fromBox = electricalBoxes.find(b => b.id === connection.from);
      const toBox = electricalBoxes.find(b => b.id === connection.to);

      if (fromBox && toBox) {
        connections.push(
          <line
            key={connection.id}
            x1={fromBox.position.x}
            y1={fromBox.position.y}
            x2={toBox.position.x}
            y2={toBox.position.y}
            stroke={connection.isCorrect ? '#10b981' : '#ef4444'}
            strokeWidth="3"
            strokeDasharray={connection.isCorrect ? 'none' : '5,5'}
            style={{
              filter: connection.isCorrect ? 'drop-shadow(0 0 3px #10b981)' : 'drop-shadow(0 0 3px #ef4444)'
            }}
          />
        );
      }
    });

    return connections;
  };

  // Render hint connections (correct answers) when in hint mode
  const renderHintConnections = () => {
    if (!showHints) return [];

    const connections: JSX.Element[] = [];
    const requiredConnections = getRequiredConnections();

    requiredConnections.forEach(({ from, to }) => {
      const fromBox = electricalBoxes.find(b => b.id === from);
      const toBox = electricalBoxes.find(b => b.id === to);

      // Only show hints for connections that haven't been made correctly yet
      const userHasCorrectConnection = userConnections.some(conn =>
        ((conn.from === from && conn.to === to) || (conn.from === to && conn.to === from)) && conn.isCorrect
      );

      if (fromBox && toBox && !userHasCorrectConnection) {
        connections.push(
          <line
            key={`hint-${from}-${to}`}
            x1={fromBox.position.x}
            y1={fromBox.position.y}
            x2={toBox.position.x}
            y2={toBox.position.y}
            stroke="#fbbf24"
            strokeWidth="2"
            strokeDasharray="10,5"
            opacity="0.7"
            style={{
              filter: 'drop-shadow(0 0 2px #fbbf24)'
            }}
          />
        );
      }
    });

    return connections;
  };

  // Render drag line when user is dragging
  const renderDragLine = () => {
    if (!dragState.isDragging || !dragState.startBox || !dragState.currentPos) return null;

    const startBox = electricalBoxes.find(b => b.id === dragState.startBox);
    if (!startBox) return null;

    return (
      <line
        x1={startBox.position.x}
        y1={startBox.position.y}
        x2={dragState.currentPos.x}
        y2={dragState.currentPos.y}
        stroke="#3b82f6"
        strokeWidth="2"
        strokeDasharray="5,5"
        opacity="0.8"
      />
    );
  };

  const getBoxTypeColor = (type: string) => {
    switch (type) {
      case 'power_input': return 'bg-purple-100 text-purple-800 border-purple-300';
      case 'outlet': return 'bg-blue-100 text-blue-800 border-blue-300';
      case 'switch': return 'bg-green-100 text-green-800 border-green-300';
      case 'light': return 'bg-yellow-100 text-yellow-800 border-yellow-300';
      case 'junction': return 'bg-gray-100 text-gray-800 border-gray-300';
      default: return 'bg-gray-100 text-gray-800 border-gray-300';
    }
  };

  return (
    <div className="w-full max-w-6xl mx-auto p-6 space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-2xl font-bold text-center">
            Electrical Training Board - Wiring Practice
          </CardTitle>
          <p className="text-center text-gray-600">
            3×3 Training Board with 9 Electrical Boxes - Learn to Wire Circuits
          </p>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Main Schematic Diagram */}
            <div className="lg:col-span-2">
              <div className="border-2 border-gray-300 rounded-lg p-4 bg-white">
                <TooltipProvider>
                  <svg
                    ref={svgRef}
                    width="100%"
                    height="450"
                    viewBox="0 0 450 450"
                    className="border rounded"
                    onMouseMove={handleMouseMove}
                    onMouseUp={handleSVGMouseUp}
                  >
                    {/* Grid background */}
                    <defs>
                      <pattern id="grid" width="25" height="25" patternUnits="userSpaceOnUse">
                        <path d="M 25 0 L 0 0 0 25" fill="none" stroke="#e5e7eb" strokeWidth="1" />
                      </pattern>
                    </defs>
                    <rect width="100%" height="100%" fill="url(#grid)" />

                    {/* Hint connections (shown when hints are enabled) */}
                    {renderHintConnections()}

                    {/* User-created connections */}
                    {renderUserConnections()}

                    {/* Drag line (shown while dragging) */}
                    {renderDragLine()}

                    {/* Electrical components */}
                    {electricalBoxes.map(box => (
                      <Tooltip key={box.id}>
                        <TooltipTrigger asChild>
                          <g
                            onMouseDown={(e) => handleBoxMouseDown(box.id, e)}
                            onMouseUp={(e) => handleBoxMouseUp(box.id, e)}
                            onClick={() => !trainingMode && setSelectedBox(selectedBox === box.id ? null : box.id)}
                            style={{ cursor: trainingMode ? 'crosshair' : 'pointer' }}
                          >
                            {renderElectricalSymbol(box)}
                          </g>
                        </TooltipTrigger>
                        <TooltipContent>
                          <div className="text-sm">
                            <div className="font-semibold">{box.label}</div>
                            {box.voltage && <div>Voltage: {box.voltage}</div>}
                            {box.amperage && <div>Amperage: {box.amperage}</div>}
                            <div>Type: {box.type}</div>
                            {trainingMode && (
                              <div className="mt-2 text-xs text-gray-600">
                                Required connections: {box.requiredConnections.length}
                              </div>
                            )}
                          </div>
                        </TooltipContent>
                      </Tooltip>
                    ))}

                    {/* Labels */}
                    {electricalBoxes.map(box => (
                      <text
                        key={`label-${box.id}`}
                        x={box.position.x}
                        y={box.position.y + 35}
                        textAnchor="middle"
                        fontSize="10"
                        fill="#374151"
                        className="font-medium"
                      >
                        {box.label}
                      </text>
                    ))}
                  </svg>
                </TooltipProvider>
              </div>
            </div>

            {/* Training Controls and Details */}
            <div className="space-y-4">
              {/* Training Mode Controls */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg flex items-center space-x-2">
                    <span>Training Mode</span>
                    {trainingMode && (
                      <Badge variant="outline" className="ml-2">
                        Active
                      </Badge>
                    )}
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex flex-col space-y-2">
                    <Button
                      onClick={() => setTrainingMode(!trainingMode)}
                      variant={trainingMode ? "destructive" : "default"}
                      className="w-full"
                    >
                      {trainingMode ? "Exit Training" : "Start Training"}
                    </Button>

                    {trainingMode && (
                      <>
                        <Button
                          onClick={resetConnections}
                          variant="outline"
                          className="w-full"
                          disabled={userConnections.length === 0}
                        >
                          <RotateCcw className="w-4 h-4 mr-2" />
                          Reset Connections
                        </Button>

                        <Button
                          onClick={() => setShowHints(!showHints)}
                          variant="outline"
                          className="w-full"
                        >
                          <Lightbulb className="w-4 h-4 mr-2" />
                          {showHints ? "Hide Hints" : "Show Hints"}
                        </Button>
                      </>
                    )}
                  </div>

                  {trainingMode && (
                    <div className="border-t pt-4">
                      <div className="text-sm space-y-2">
                        <div className="flex justify-between">
                          <span>Progress:</span>
                          <span className="font-semibold">
                            {score.correct} / {score.total}
                          </span>
                        </div>
                        <div className="w-full bg-gray-200 rounded-full h-2">
                          <div
                            className="bg-green-500 h-2 rounded-full transition-all duration-300"
                            style={{ width: `${score.total > 0 ? (score.correct / score.total) * 100 : 0}%` }}
                          />
                        </div>
                        {score.correct === score.total && score.total > 0 && (
                          <div className="flex items-center space-x-1 text-green-600 text-sm font-medium">
                            <CheckCircle className="w-4 h-4" />
                            <span>Perfect! All connections correct!</span>
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {trainingMode && (
                    <div className="border-t pt-4 text-xs text-gray-600 space-y-1">
                      <p><strong>Instructions:</strong></p>
                      <p>• Click and drag from one component to another to create a wire</p>
                      <p>• <span className="text-green-600">Green wires</span> = Correct connections</p>
                      <p>• <span className="text-red-600">Red dashed wires</span> = Incorrect connections</p>
                      <p>• <span className="text-yellow-600">Yellow dashed wires</span> = Hints (when enabled)</p>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Connection Status */}
              {trainingMode && userConnections.length > 0 && (
                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg">Connection Status</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    {userConnections.map(connection => {
                      const fromBox = electricalBoxes.find(b => b.id === connection.from);
                      const toBox = electricalBoxes.find(b => b.id === connection.to);
                      return (
                        <div key={connection.id} className="flex items-center space-x-2 text-sm">
                          {connection.isCorrect ? (
                            <CheckCircle className="w-4 h-4 text-green-500" />
                          ) : (
                            <XCircle className="w-4 h-4 text-red-500" />
                          )}
                          <span className={connection.isCorrect ? "text-green-700" : "text-red-700"}>
                            {fromBox?.label} ↔ {toBox?.label}
                          </span>
                        </div>
                      );
                    })}
                  </CardContent>
                </Card>
              )}

              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Component Legend</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex items-center space-x-2">
                    <div className="w-4 h-4 border-2 border-purple-500 bg-purple-100 rounded"></div>
                    <span className="text-sm">Power Input</span>
                  </div>
                  <div className="flex items-center space-x-2">
                    <div className="w-4 h-4 border-2 border-blue-500 bg-blue-100 rounded-full"></div>
                    <span className="text-sm">Electrical Outlet</span>
                  </div>
                  <div className="flex items-center space-x-2">
                    <div className="w-4 h-4 border-2 border-green-500 bg-green-100 rounded-full"></div>
                    <span className="text-sm">Switch</span>
                  </div>
                  <div className="flex items-center space-x-2">
                    <div className="w-4 h-4 border-2 border-yellow-500 bg-yellow-100 rounded-full"></div>
                    <span className="text-sm">Light Fixture</span>
                  </div>
                  <div className="flex items-center space-x-2">
                    <div className="w-4 h-4 border-2 border-gray-500 bg-gray-100 rounded"></div>
                    <span className="text-sm">Junction Box</span>
                  </div>
                </CardContent>
              </Card>

              {/* Selected Component Details */}
              {selectedBox && (
                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg">Component Details</CardTitle>
                  </CardHeader>
                  <CardContent>
                    {(() => {
                      const box = electricalBoxes.find(b => b.id === selectedBox);
                      if (!box) return null;

                      return (
                        <div className="space-y-2">
                          <div className="flex items-center space-x-2">
                            <Badge className={getBoxTypeColor(box.type)}>
                              {box.type.toUpperCase()}
                            </Badge>
                          </div>
                          <h3 className="font-semibold">{box.label}</h3>
                          {box.voltage && <p><strong>Voltage:</strong> {box.voltage}</p>}
                          {box.amperage && <p><strong>Amperage:</strong> {box.amperage}</p>}
                          <p><strong>Required Connections:</strong> {box.requiredConnections.length}</p>
                          <div className="text-sm text-gray-600">
                            <p>Should connect to:</p>
                            <ul className="list-disc list-inside ml-2">
                              {box.requiredConnections.map(connId => {
                                const connBox = electricalBoxes.find(b => b.id === connId);
                                return (
                                  <li key={connId}>
                                    {connBox?.label || connId}
                                  </li>
                                );
                              })}
                            </ul>
                          </div>
                        </div>
                      );
                    })()}
                  </CardContent>
                </Card>
              )}

              {/* Training Board Information */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Training Board Information</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2 text-sm">
                  <p><strong>Supply Voltage:</strong> 120V AC</p>
                  <p><strong>Maximum Current:</strong> 20A</p>
                  <p><strong>Board Type:</strong> 3×3 Training Grid</p>
                  <p><strong>Wire Gauge:</strong> 12 AWG</p>
                  <p><strong>Ground Required:</strong> Yes</p>
                  <p><strong>Total Boxes:</strong> 9 Training Positions</p>
                  <p><strong>GFCI Protection:</strong> Outlet Circuits</p>
                </CardContent>
              </Card>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default ElectricalSchematic;
