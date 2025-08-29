
'use client';

import React, { useState } from 'react';
import LabsMenu from '@/components/LabsMenu';
import Lab from '@/components/Lab';

interface Lab {
  id: number;
  title: string;
  description: string;
  systemPrompt: string;
  firstMessage: string;
  agentConfig: any;
}

interface LabStep {
  id: number;
  labId: number;
  stepNumber: number;
  title: string;
  description: string;
  verificationCriteria: string[];
}

export default function Home() {
  const [selectedLab, setSelectedLab] = useState<Lab | null>(null);
  const [selectedLabSteps, setSelectedLabSteps] = useState<LabStep[]>([]);

  const handleSelectLab = (lab: Lab, steps: LabStep[]) => {
    setSelectedLab(lab);
    setSelectedLabSteps(steps);
  };

  const handleBackToMenu = () => {
    setSelectedLab(null);
    setSelectedLabSteps([]);
  };

  if (selectedLab) {
    return (
      <Lab
        lab={selectedLab}
        steps={selectedLabSteps}
        onBack={handleBackToMenu}
      />
    );
  }

  return <LabsMenu onSelectLab={handleSelectLab} />;
}
