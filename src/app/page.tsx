
import ElectricalSchematic from '@/components/ElectricalSchematic';

export default function Home() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-100 to-gray-200 dark:from-gray-900 dark:to-gray-800 p-8">
      <div className="container mx-auto">
        <h1 className="text-4xl font-bold text-center mb-8 text-gray-800 dark:text-gray-200">
          Electrical Trade School Training Board
        </h1>
        <ElectricalSchematic />
      </div>
    </div>
  );
}
