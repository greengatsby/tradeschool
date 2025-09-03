'use client';

import React, { useEffect, useState } from 'react';
import Image from 'next/image';
import { supabase } from '@/utils/supabase';
import { Plus, Edit, Trash2, Save, X, ChevronDown, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';

interface Lab {
  id: number;
  title: string;
  description: string;
  system_prompt: string;
  first_message: string;
  agent_config: any;
  created_at: string;
  updated_at: string;
}

interface LabStep {
  id: number;
  lab_id: number;
  step_number: number;
  title: string;
  description: string;
  verification_criteria: string[];
  created_at: string;
  updated_at: string;
}

interface NewLab {
  title: string;
  description: string;
  system_prompt: string;
  first_message: string;
  agent_config: any;
}

interface NewLabStep {
  step_number: number;
  title: string;
  description: string;
  verification_criteria: string[];
}

export default function AdminPage() {
  const [labs, setLabs] = useState<Lab[]>([]);
  const [labSteps, setLabSteps] = useState<{ [labId: number]: LabStep[] }>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [expandedLabs, setExpandedLabs] = useState<Set<number>>(new Set());

  // Form states
  const [editingLab, setEditingLab] = useState<Lab | null>(null);
  const [editingStep, setEditingStep] = useState<LabStep | null>(null);
  const [showNewLabForm, setShowNewLabForm] = useState(false);
  const [showNewStepForm, setShowNewStepForm] = useState<number | null>(null);

  const [newLab, setNewLab] = useState<NewLab>({
    title: '',
    description: '',
    system_prompt: '',
    first_message: '',
    agent_config: {
      name: 'Vision Assistant',
      tools: [
        {
          id: "captureScreenshot",
          name: "captureScreenshot",
          description: "Capture a frame from the user camera to analyze",
          parameters: {
            type: "object",
            properties: {
              question: { type: "string", description: "What do you want to know from the screenshot?" }
            },
            required: ["question"]
          },
          fire_and_forget: false
        },
        {
          id: "markStepComplete",
          name: "markStepComplete",
          description: "Mark a step as complete when all verification criteria are met",
          parameters: {
            type: "object",
            properties: {
              stepId: { type: "number", description: "The step number to mark complete (1, 2, or 3)" }
            },
            required: ["stepId"]
          },
          fire_and_forget: false
        }
      ],
      tts: {
        provider: "cartesia",
        config: {
          model: "sonic-2",
          voice: "bbee10a8-4f08-4c5c-8282-e69299115055"
        }
      }
    }
  });

  const [newStep, setNewStep] = useState<NewLabStep>({
    step_number: 1,
    title: '',
    description: '',
    verification_criteria: ['']
  });

  useEffect(() => {
    fetchLabs();
  }, []);

  const fetchLabs = async () => {
    try {
      setLoading(true);
      setError(null);

      const { data: labsData, error: labsError } = await supabase
        .from('tradeschool_labs')
        .select('*')
        .order('id');

      if (labsError) throw labsError;

      setLabs(labsData || []);

      // Fetch steps for all labs
      const { data: stepsData, error: stepsError } = await supabase
        .from('tradeschool_lab_steps')
        .select('*')
        .order('lab_id, step_number');

      if (stepsError) throw stepsError;

      // Group steps by lab_id
      const stepsGrouped = (stepsData || []).reduce((acc, step) => {
        if (!acc[step.lab_id]) {
          acc[step.lab_id] = [];
        }
        acc[step.lab_id].push(step);
        return acc;
      }, {} as { [labId: number]: LabStep[] });

      setLabSteps(stepsGrouped);
    } catch (err) {
      console.error('Error fetching labs:', err);
      setError(err instanceof Error ? err.message : 'Failed to load labs');
    } finally {
      setLoading(false);
    }
  };

  const showMessage = (message: string, isError = false) => {
    if (isError) {
      setError(message);
      setSuccess(null);
    } else {
      setSuccess(message);
      setError(null);
    }
    setTimeout(() => {
      setError(null);
      setSuccess(null);
    }, 3000);
  };

  const handleCreateLab = async () => {
    try {
      const resp = await fetch('/api/admin/labs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newLab),
      });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data?.error || 'Failed to create lab');

      setLabs([...labs, data]);
      setNewLab({
        title: '',
        description: '',
        system_prompt: '',
        first_message: '',
        agent_config: {
          name: 'Vision Assistant',
          tools: [
            {
              id: "captureScreenshot",
              name: "captureScreenshot",
              description: "Capture a frame from the user camera to analyze",
              parameters: {
                type: "object",
                properties: {
                  question: { type: "string", description: "What do you want to know from the screenshot?" }
                },
                required: ["question"]
              },
              fire_and_forget: false
            },
            {
              id: "markStepComplete",
              name: "markStepComplete",
              description: "Mark a step as complete when all verification criteria are met",
              parameters: {
                type: "object",
                properties: {
                  stepId: { type: "number", description: "The step number to mark complete (1, 2, or 3)" }
                },
                required: ["stepId"]
              },
              fire_and_forget: false
            }
          ],
          tts: {
            provider: "cartesia",
            config: {
              model: "sonic-2",
              voice: "bbee10a8-4f08-4c5c-8282-e69299115055"
            }
          }
        }
      });
      setShowNewLabForm(false);
      showMessage('Lab created successfully!');
    } catch (err) {
      showMessage(err instanceof Error ? err.message : 'Failed to create lab', true);
    }
  };

  const handleUpdateLab = async (lab: Lab) => {
    try {
      const resp = await fetch('/api/admin/labs', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: lab.id,
          title: lab.title,
          description: lab.description,
          system_prompt: lab.system_prompt,
          first_message: lab.first_message,
          agent_config: lab.agent_config,
        }),
      });
      const data = await resp.json().catch(() => ({}));
      if (!resp.ok) throw new Error(data?.error || 'Failed to update lab');

      setLabs(labs.map(l => l.id === lab.id ? lab : l));
      setEditingLab(null);
      showMessage('Lab updated successfully!');
    } catch (err) {
      showMessage(err instanceof Error ? err.message : 'Failed to update lab', true);
    }
  };

  const handleDeleteLab = async (labId: number) => {
    if (!confirm('Are you sure you want to delete this lab? This will also delete all its steps.')) {
      return;
    }

    try {
      const { error } = await supabase
        .from('tradeschool_labs')
        .delete()
        .eq('id', labId);

      if (error) throw error;

      setLabs(labs.filter(l => l.id !== labId));
      delete labSteps[labId];
      setLabSteps({ ...labSteps });
      showMessage('Lab deleted successfully!');
    } catch (err) {
      showMessage(err instanceof Error ? err.message : 'Failed to delete lab', true);
    }
  };

  const handleCreateStep = async (labId: number) => {
    try {
      const { data, error } = await supabase
        .from('tradeschool_lab_steps')
        .insert([{
          lab_id: labId,
          ...newStep
        }])
        .select()
        .single();

      if (error) throw error;

      const updatedSteps = { ...labSteps };
      if (!updatedSteps[labId]) {
        updatedSteps[labId] = [];
      }
      updatedSteps[labId].push(data);
      updatedSteps[labId].sort((a, b) => a.step_number - b.step_number);
      setLabSteps(updatedSteps);

      setNewStep({ step_number: 1, title: '', description: '', verification_criteria: [''] });
      setShowNewStepForm(null);
      showMessage('Step created successfully!');
    } catch (err) {
      showMessage(err instanceof Error ? err.message : 'Failed to create step', true);
    }
  };

  const handleUpdateStep = async (step: LabStep) => {
    try {
      const { error } = await supabase
        .from('tradeschool_lab_steps')
        .update({
          step_number: step.step_number,
          title: step.title,
          description: step.description,
          verification_criteria: step.verification_criteria
        })
        .eq('id', step.id);

      if (error) throw error;

      const updatedSteps = { ...labSteps };
      updatedSteps[step.lab_id] = updatedSteps[step.lab_id].map(s =>
        s.id === step.id ? step : s
      ).sort((a, b) => a.step_number - b.step_number);
      setLabSteps(updatedSteps);

      setEditingStep(null);
      showMessage('Step updated successfully!');
    } catch (err) {
      showMessage(err instanceof Error ? err.message : 'Failed to update step', true);
    }
  };

  const handleDeleteStep = async (stepId: number, labId: number) => {
    if (!confirm('Are you sure you want to delete this step?')) {
      return;
    }

    try {
      const { error } = await supabase
        .from('tradeschool_lab_steps')
        .delete()
        .eq('id', stepId);

      if (error) throw error;

      const updatedSteps = { ...labSteps };
      updatedSteps[labId] = updatedSteps[labId].filter(s => s.id !== stepId);
      setLabSteps(updatedSteps);

      showMessage('Step deleted successfully!');
    } catch (err) {
      showMessage(err instanceof Error ? err.message : 'Failed to delete step', true);
    }
  };

  const toggleLabExpansion = (labId: number) => {
    const newExpanded = new Set(expandedLabs);
    if (newExpanded.has(labId)) {
      newExpanded.delete(labId);
    } else {
      newExpanded.add(labId);
    }
    setExpandedLabs(newExpanded);
  };

  const addCriteriaField = (criteria: string[], setCriteria: (criteria: string[]) => void) => {
    setCriteria([...criteria, '']);
  };

  const updateCriteriaField = (index: number, value: string, criteria: string[], setCriteria: (criteria: string[]) => void) => {
    const updated = [...criteria];
    updated[index] = value;
    setCriteria(updated);
  };

  const removeCriteriaField = (index: number, criteria: string[], setCriteria: (criteria: string[]) => void) => {
    setCriteria(criteria.filter((_, i) => i !== index));
  };

  if (loading) {
    return (
      <div className="min-h-screen p-4 md:p-6 bg-gray-50">
        <div className="max-w-6xl mx-auto">
          <div className="flex items-center justify-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900"></div>
            <span className="ml-2 text-gray-600">Loading admin panel...</span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen p-4 md:p-6 bg-gray-50">
      <div className="max-w-6xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <a
              href="/"
              className="text-sm text-gray-600 hover:text-gray-900 underline"
            >
              ← Back to Labs
            </a>
            <div className="flex items-center gap-2">
              <Image src="/lms_logo.svg" alt="Roley logo" width={20} height={20} priority />
              <h1 className="text-xl md:text-2xl font-semibold">Lab Administration</h1>
            </div>
          </div>
          <Button onClick={() => setShowNewLabForm(true)} className="flex items-center gap-2">
            <Plus className="w-4 h-4" />
            New Lab
          </Button>
        </div>

        {/* Messages */}
        {error && (
          <Alert className="border-red-200 bg-red-50">
            <AlertDescription className="text-red-800">{error}</AlertDescription>
          </Alert>
        )}
        {success && (
          <Alert className="border-green-200 bg-green-50">
            <AlertDescription className="text-green-800">{success}</AlertDescription>
          </Alert>
        )}

        {/* New Lab Form */}
        {showNewLabForm && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                Create New Lab
                <Button variant="ghost" size="sm" onClick={() => setShowNewLabForm(false)}>
                  <X className="w-4 h-4" />
                </Button>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1">Title</label>
                <Input
                  value={newLab.title}
                  onChange={(e) => setNewLab({ ...newLab, title: e.target.value })}
                  placeholder="Lab title"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Description</label>
                <Textarea
                  value={newLab.description}
                  onChange={(e) => setNewLab({ ...newLab, description: e.target.value })}
                  placeholder="Lab description"
                  rows={3}
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">System Prompt</label>
                <Textarea
                  value={newLab.system_prompt}
                  onChange={(e) => setNewLab({ ...newLab, system_prompt: e.target.value })}
                  placeholder="AI assistant system prompt"
                  rows={6}
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">First Message</label>
                <Textarea
                  value={newLab.first_message}
                  onChange={(e) => setNewLab({ ...newLab, first_message: e.target.value })}
                  placeholder="Initial message from AI assistant"
                  rows={3}
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Agent Configuration (JSON)</label>
                <Textarea
                  value={JSON.stringify(newLab.agent_config, null, 2)}
                  onChange={(e) => {
                    try {
                      const parsed = JSON.parse(e.target.value);
                      setNewLab({ ...newLab, agent_config: parsed });
                    } catch (error) {
                      // Keep the text as is if it's not valid JSON yet
                    }
                  }}
                  placeholder="Agent configuration in JSON format"
                  rows={10}
                  className="font-mono text-sm"
                />
                <p className="text-xs text-gray-500 mt-1">
                  Configure agent name, tools, and TTS settings in JSON format
                </p>
              </div>
              <div className="flex gap-2">
                <Button onClick={handleCreateLab} className="flex items-center gap-2">
                  <Save className="w-4 h-4" />
                  Create Lab
                </Button>
                <Button variant="outline" onClick={() => setShowNewLabForm(false)}>
                  Cancel
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Labs List */}
        <div className="space-y-4">
          {labs.map((lab) => (
            <Card key={lab.id}>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => toggleLabExpansion(lab.id)}
                    >
                      {expandedLabs.has(lab.id) ? (
                        <ChevronDown className="w-4 h-4" />
                      ) : (
                        <ChevronRight className="w-4 h-4" />
                      )}
                    </Button>
                    <CardTitle className="text-lg">{lab.title}</CardTitle>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setEditingLab(lab)}
                    >
                      <Edit className="w-4 h-4" />
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleDeleteLab(lab.id)}
                      className="text-red-600 hover:text-red-700"
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              </CardHeader>

              {expandedLabs.has(lab.id) && (
                <CardContent className="space-y-4">
                  <p className="text-gray-600">{lab.description}</p>

                  {/* Steps Section */}
                  <div>
                    <div className="flex items-center justify-between mb-3">
                      <h4 className="font-medium">Steps ({labSteps[lab.id]?.length || 0})</h4>
                      <Button
                        size="sm"
                        onClick={() => setShowNewStepForm(lab.id)}
                        className="flex items-center gap-1"
                      >
                        <Plus className="w-3 h-3" />
                        Add Step
                      </Button>
                    </div>

                    {/* New Step Form */}
                    {showNewStepForm === lab.id && (
                      <Card className="mb-4">
                        <CardContent className="pt-4 space-y-3">
                          <div className="grid grid-cols-2 gap-3">
                            <div>
                              <label className="block text-sm font-medium mb-1">Step Number</label>
                              <Input
                                type="number"
                                value={newStep.step_number}
                                onChange={(e) => setNewStep({ ...newStep, step_number: parseInt(e.target.value) || 1 })}
                                min="1"
                              />
                            </div>
                            <div>
                              <label className="block text-sm font-medium mb-1">Title</label>
                              <Input
                                value={newStep.title}
                                onChange={(e) => setNewStep({ ...newStep, title: e.target.value })}
                                placeholder="Step title"
                              />
                            </div>
                          </div>
                          <div>
                            <label className="block text-sm font-medium mb-1">Description</label>
                            <Textarea
                              value={newStep.description}
                              onChange={(e) => setNewStep({ ...newStep, description: e.target.value })}
                              placeholder="Step description"
                              rows={2}
                            />
                          </div>
                          <div>
                            <label className="block text-sm font-medium mb-1">Verification Criteria</label>
                            {newStep.verification_criteria.map((criteria, index) => (
                              <div key={index} className="flex gap-2 mb-2">
                                <Input
                                  value={criteria}
                                  onChange={(e) => updateCriteriaField(index, e.target.value, newStep.verification_criteria, (updated) => setNewStep({ ...newStep, verification_criteria: updated }))}
                                  placeholder="Verification criteria"
                                />
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => removeCriteriaField(index, newStep.verification_criteria, (updated) => setNewStep({ ...newStep, verification_criteria: updated }))}
                                  disabled={newStep.verification_criteria.length === 1}
                                >
                                  <X className="w-3 h-3" />
                                </Button>
                              </div>
                            ))}
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => addCriteriaField(newStep.verification_criteria, (updated) => setNewStep({ ...newStep, verification_criteria: updated }))}
                            >
                              <Plus className="w-3 h-3 mr-1" />
                              Add Criteria
                            </Button>
                          </div>
                          <div className="flex gap-2">
                            <Button onClick={() => handleCreateStep(lab.id)} size="sm">
                              <Save className="w-3 h-3 mr-1" />
                              Save Step
                            </Button>
                            <Button variant="outline" size="sm" onClick={() => setShowNewStepForm(null)}>
                              Cancel
                            </Button>
                          </div>
                        </CardContent>
                      </Card>
                    )}

                    {/* Steps List */}
                    <div className="space-y-2">
                      {labSteps[lab.id]?.map((step) => (
                        <div key={step.id} className="border rounded p-3 bg-gray-50">
                          {editingStep?.id === step.id ? (
                            <div className="space-y-3">
                              <div className="grid grid-cols-2 gap-3">
                                <div>
                                  <label className="block text-sm font-medium mb-1">Step Number</label>
                                  <Input
                                    type="number"
                                    value={editingStep.step_number}
                                    onChange={(e) => setEditingStep({ ...editingStep, step_number: parseInt(e.target.value) || 1 })}
                                    min="1"
                                  />
                                </div>
                                <div>
                                  <label className="block text-sm font-medium mb-1">Title</label>
                                  <Input
                                    value={editingStep.title}
                                    onChange={(e) => setEditingStep({ ...editingStep, title: e.target.value })}
                                  />
                                </div>
                              </div>
                              <div>
                                <label className="block text-sm font-medium mb-1">Description</label>
                                <Textarea
                                  value={editingStep.description}
                                  onChange={(e) => setEditingStep({ ...editingStep, description: e.target.value })}
                                  rows={2}
                                />
                              </div>
                              <div>
                                <label className="block text-sm font-medium mb-1">Verification Criteria</label>
                                {editingStep.verification_criteria.map((criteria, index) => (
                                  <div key={index} className="flex gap-2 mb-2">
                                    <Input
                                      value={criteria}
                                      onChange={(e) => {
                                        const updated = [...editingStep.verification_criteria];
                                        updated[index] = e.target.value;
                                        setEditingStep({ ...editingStep, verification_criteria: updated });
                                      }}
                                    />
                                    <Button
                                      variant="outline"
                                      size="sm"
                                      onClick={() => {
                                        const updated = editingStep.verification_criteria.filter((_, i) => i !== index);
                                        setEditingStep({ ...editingStep, verification_criteria: updated });
                                      }}
                                      disabled={editingStep.verification_criteria.length === 1}
                                    >
                                      <X className="w-3 h-3" />
                                    </Button>
                                  </div>
                                ))}
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => setEditingStep({ ...editingStep, verification_criteria: [...editingStep.verification_criteria, ''] })}
                                >
                                  <Plus className="w-3 h-3 mr-1" />
                                  Add Criteria
                                </Button>
                              </div>
                              <div className="flex gap-2">
                                <Button onClick={() => handleUpdateStep(editingStep)} size="sm">
                                  <Save className="w-3 h-3 mr-1" />
                                  Save
                                </Button>
                                <Button variant="outline" size="sm" onClick={() => setEditingStep(null)}>
                                  Cancel
                                </Button>
                              </div>
                            </div>
                          ) : (
                            <div className="flex items-start justify-between">
                              <div>
                                <div className="flex items-center gap-2 mb-1">
                                  <span className="font-medium">Step {step.step_number}:</span>
                                  <span>{step.title}</span>
                                </div>
                                <p className="text-sm text-gray-600 mb-2">{step.description}</p>
                                <div className="text-xs">
                                  <span className="font-medium">Criteria:</span>
                                  <ul className="list-disc list-inside ml-2 mt-1">
                                    {step.verification_criteria.map((criteria, index) => (
                                      <li key={index} className="text-gray-600">{criteria}</li>
                                    ))}
                                  </ul>
                                </div>
                              </div>
                              <div className="flex gap-1">
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => setEditingStep(step)}
                                >
                                  <Edit className="w-3 h-3" />
                                </Button>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => handleDeleteStep(step.id, lab.id)}
                                  className="text-red-600 hover:text-red-700"
                                >
                                  <Trash2 className="w-3 h-3" />
                                </Button>
                              </div>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                </CardContent>
              )}
            </Card>
          ))}
        </div>

        {/* Edit Lab Modal */}
        {editingLab && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
            <Card className="w-full max-w-2xl max-h-[90vh] overflow-y-auto">
              <CardHeader>
                <CardTitle className="flex items-center justify-between">
                  Edit Lab
                  <Button variant="ghost" size="sm" onClick={() => setEditingLab(null)}>
                    <X className="w-4 h-4" />
                  </Button>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <label className="block text-sm font-medium mb-1">Title</label>
                  <Input
                    value={editingLab.title}
                    onChange={(e) => setEditingLab({ ...editingLab, title: e.target.value })}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Description</label>
                  <Textarea
                    value={editingLab.description}
                    onChange={(e) => setEditingLab({ ...editingLab, description: e.target.value })}
                    rows={3}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">System Prompt</label>
                  <Textarea
                    value={editingLab.system_prompt}
                    onChange={(e) => setEditingLab({ ...editingLab, system_prompt: e.target.value })}
                    rows={6}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">First Message</label>
                  <Textarea
                    value={editingLab.first_message}
                    onChange={(e) => setEditingLab({ ...editingLab, first_message: e.target.value })}
                    rows={3}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Agent Configuration (JSON)</label>
                  <Textarea
                    value={JSON.stringify(editingLab.agent_config, null, 2)}
                    onChange={(e) => {
                      try {
                        const parsed = JSON.parse(e.target.value);
                        setEditingLab({ ...editingLab, agent_config: parsed });
                      } catch (error) {
                        // Keep the text as is if it's not valid JSON yet
                      }
                    }}
                    rows={10}
                    className="font-mono text-sm"
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    Configure agent name, tools, and TTS settings in JSON format
                  </p>
                </div>
                <div className="flex gap-2">
                  <Button onClick={() => handleUpdateLab(editingLab)} className="flex items-center gap-2">
                    <Save className="w-4 h-4" />
                    Save Changes
                  </Button>
                  <Button variant="outline" onClick={() => setEditingLab(null)}>
                    Cancel
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>
        )}
      </div>
    </div>
  );
}
