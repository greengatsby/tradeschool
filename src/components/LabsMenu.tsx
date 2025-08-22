'use client';

import React, { useEffect, useState } from 'react';
import Image from 'next/image';
import { supabase } from '@/utils/supabase';
import { ChevronRight, Clock } from 'lucide-react';

interface Lab {
  id: number;
  title: string;
  description: string;
  systemPrompt: string;
  firstMessage: string;
}

interface LabStep {
  id: number;
  labId: number;
  stepNumber: number;
  title: string;
  description: string;
  verificationCriteria: string[];
}

interface LabsMenuProps {
  onSelectLab: (lab: Lab, steps: LabStep[]) => void;
}

export default function LabsMenu({ onSelectLab }: LabsMenuProps) {
  const [labs, setLabs] = useState<Lab[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchLabs = async () => {
      try {
        setLoading(true);
        setError(null);

        // Fetch labs from Supabase
        const { data: labsData, error: labsError } = await supabase
          .from('tradeschool_labs')
          .select('*')
          .order('id');

        if (labsError) {
          throw new Error(`Failed to fetch labs: ${labsError.message}`);
        }

        const formattedLabs: Lab[] = labsData.map(lab => ({
          id: lab.id,
          title: lab.title,
          description: lab.description,
          systemPrompt: lab.system_prompt,
          firstMessage: lab.first_message
        }));

        setLabs(formattedLabs);
      } catch (err) {
        console.error('Error fetching labs:', err);
        setError(err instanceof Error ? err.message : 'Failed to load labs');
      } finally {
        setLoading(false);
      }
    };

    fetchLabs();
  }, []);

  const handleLabSelect = async (lab: Lab) => {
    try {
      // Fetch steps for the selected lab
      const { data: stepsData, error: stepsError } = await supabase
        .from('tradeschool_lab_steps')
        .select('*')
        .eq('lab_id', lab.id)
        .order('step_number');

      if (stepsError) {
        throw new Error(`Failed to fetch lab steps: ${stepsError.message}`);
      }

      const formattedSteps: LabStep[] = stepsData.map(step => ({
        id: step.step_number, // Use step_number as the id for the Lab component
        labId: step.lab_id,
        stepNumber: step.step_number,
        title: step.title,
        description: step.description,
        verificationCriteria: step.verification_criteria || []
      }));

      onSelectLab(lab, formattedSteps);
    } catch (err) {
      console.error('Error fetching lab steps:', err);
      setError(err instanceof Error ? err.message : 'Failed to load lab steps');
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen p-4 md:p-6 bg-gray-50">
        <div className="max-w-4xl mx-auto">
          <div className="flex items-center justify-center gap-2 mb-8">
            <Image src="/lms_logo.svg" alt="Roley logo" width={20} height={20} priority />
            <h1 className="text-xl md:text-2xl font-semibold text-center">Roley Tradeschool Assistant</h1>
          </div>
          <div className="flex items-center justify-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900"></div>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen p-4 md:p-6 bg-gray-50">
        <div className="max-w-4xl mx-auto">
          <div className="flex items-center justify-center gap-2 mb-8">
            <Image src="/lms_logo.svg" alt="Roley logo" width={20} height={20} priority />
            <h1 className="text-xl md:text-2xl font-semibold text-center">Roley Tradeschool Assistant</h1>
          </div>
          <div className="bg-red-50 border border-red-200 rounded-lg p-6 text-center">
            <p className="text-red-800 font-medium">Couldn't load labs</p>
            <button
              onClick={() => window.location.reload()}
              className="mt-4 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
            >
              Retry
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen p-4 md:p-6 bg-gray-50">
      <div className="max-w-4xl mx-auto">
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-2">
            <Image src="/lms_logo.svg" alt="Roley logo" width={20} height={20} priority />
            <h1 className="text-xl md:text-2xl font-semibold">Roley Tradeschool Assistant</h1>
          </div>
          <a
            href="/admin"
            className="text-sm text-gray-600 hover:text-gray-900 underline"
          >
            Admin
          </a>
        </div>

        <div className="mb-6">
          <h2 className="text-lg font-semibold text-gray-900">Labs</h2>
        </div>

        {labs.length === 0 ? (
          <div className="bg-white rounded-xl shadow-sm p-8 text-center">
            <div className="text-gray-400 mb-4">
              <Clock className="w-12 h-12 mx-auto" />
            </div>
            <h3 className="text-lg font-medium text-gray-900">No labs yet</h3>
          </div>
        ) : (
          <div className="grid gap-4 md:gap-6">
            {labs.map((lab) => (
              <div
                key={lab.id}
                className="bg-white rounded-xl shadow-sm hover:shadow-md transition-shadow border border-gray-200 overflow-hidden group cursor-pointer"
                onClick={() => handleLabSelect(lab)}
              >
                <div className="p-6">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-2">
                        <h3 className="text-lg font-semibold text-gray-900 group-hover:text-blue-600 transition-colors">
                          {lab.title}
                        </h3>
                        <span className="w-1.5 h-1.5 rounded-full bg-green-500" aria-hidden="true"></span>
                      </div>
                      <p className="text-gray-600 text-sm truncate">{lab.description}</p>
                    </div>
                    <div className="flex-shrink-0">
                      <ChevronRight className="w-5 h-5 text-gray-400 group-hover:text-blue-600 transition-colors" />
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

      </div>
    </div>
  );
}
