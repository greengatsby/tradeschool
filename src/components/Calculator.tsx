'use client';

import { useState, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Trash2, RotateCcw } from 'lucide-react';

type HistoryItem = {
  expression: string;
  result: string;
};

export default function Calculator() {
  const [display, setDisplay] = useState('0');
  const [previousValue, setPreviousValue] = useState<number | null>(null);
  const [operation, setOperation] = useState<string | null>(null);
  const [waitingForOperand, setWaitingForOperand] = useState(false);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const inputNumber = useCallback((num: string) => {
    setError(null);
    if (waitingForOperand) {
      setDisplay(num);
      setWaitingForOperand(false);
    } else {
      const newDisplay = display === '0' ? num : display + num;
      if (newDisplay.length <= 12) {
        setDisplay(newDisplay);
      }
    }
  }, [display, waitingForOperand]);

  const inputDecimal = useCallback(() => {
    setError(null);
    if (waitingForOperand) {
      setDisplay('0.');
      setWaitingForOperand(false);
    } else if (display.indexOf('.') === -1) {
      setDisplay(display + '.');
    }
  }, [display, waitingForOperand]);

  const clear = useCallback(() => {
    setDisplay('0');
    setPreviousValue(null);
    setOperation(null);
    setWaitingForOperand(false);
    setError(null);
  }, []);

  const clearHistory = useCallback(() => {
    setHistory([]);
  }, []);

  const backspace = useCallback(() => {
    setError(null);
    if (!waitingForOperand && display !== '0') {
      const newDisplay = display.slice(0, -1);
      setDisplay(newDisplay || '0');
    }
  }, [display, waitingForOperand]);

  const toggleSign = useCallback(() => {
    setError(null);
    if (display !== '0') {
      setDisplay(display.startsWith('-') ? display.slice(1) : '-' + display);
    }
  }, [display]);

  const percentage = useCallback(() => {
    setError(null);
    const value = parseFloat(display);
    if (!isNaN(value)) {
      setDisplay(String(value / 100));
    }
  }, [display]);

  const squareRoot = useCallback(() => {
    setError(null);
    const value = parseFloat(display);
    if (value < 0) {
      setError('Cannot calculate square root of negative number');
      return;
    }
    if (!isNaN(value)) {
      const result = Math.sqrt(value);
      setDisplay(String(result));
      setHistory(prev => [...prev, { expression: `√${value}`, result: String(result) }]);
    }
  }, [display]);

  const performOperation = useCallback((nextOperation: string) => {
    setError(null);
    const inputValue = parseFloat(display);

    if (isNaN(inputValue)) {
      setError('Invalid input');
      return;
    }

    if (previousValue === null) {
      setPreviousValue(inputValue);
    } else if (operation) {
      const currentValue = previousValue || 0;
      const result = calculate(currentValue, inputValue, operation);
      
      if (result === null) {
        return;
      }
      
      const formattedResult = Number.isInteger(result) ? String(result) : result.toFixed(8).replace(/\.?0+$/, '');
      setDisplay(formattedResult);
      setPreviousValue(result);
      
      setHistory(prev => [...prev, { 
        expression: `${currentValue} ${operation} ${inputValue}`, 
        result: formattedResult 
      }]);
    }

    setWaitingForOperand(true);
    setOperation(nextOperation);
  }, [display, previousValue, operation]);

  const calculate = (firstValue: number, secondValue: number, operation: string): number | null => {
    switch (operation) {
      case '+':
        return firstValue + secondValue;
      case '-':
        return firstValue - secondValue;
      case '×':
        return firstValue * secondValue;
      case '÷':
        if (secondValue === 0) {
          setError('Cannot divide by zero');
          return null;
        }
        return firstValue / secondValue;
      default:
        return secondValue;
    }
  };

  const handleEquals = useCallback(() => {
    setError(null);
    const inputValue = parseFloat(display);

    if (isNaN(inputValue)) {
      setError('Invalid input');
      return;
    }

    if (previousValue !== null && operation) {
      const result = calculate(previousValue, inputValue, operation);
      
      if (result === null) {
        return;
      }
      
      const formattedResult = Number.isInteger(result) ? String(result) : result.toFixed(8).replace(/\.?0+$/, '');
      setDisplay(formattedResult);
      
      setHistory(prev => [...prev, { 
        expression: `${previousValue} ${operation} ${inputValue}`, 
        result: formattedResult 
      }]);
      
      setPreviousValue(null);
      setOperation(null);
      setWaitingForOperand(true);
    }
  }, [display, previousValue, operation]);

  const handleKeyPress = useCallback((event: KeyboardEvent) => {
    const { key } = event;
    
    if (key >= '0' && key <= '9') {
      inputNumber(key);
    } else if (key === '.') {
      inputDecimal();
    } else if (key === '+') {
      performOperation('+');
    } else if (key === '-') {
      performOperation('-');
    } else if (key === '*') {
      performOperation('×');
    } else if (key === '/') {
      event.preventDefault();
      performOperation('÷');
    } else if (key === 'Enter' || key === '=') {
      event.preventDefault();
      handleEquals();
    } else if (key === 'Escape' || key === 'c' || key === 'C') {
      clear();
    } else if (key === 'Backspace') {
      backspace();
    } else if (key === '%') {
      percentage();
    }
  }, [inputNumber, inputDecimal, performOperation, handleEquals, clear, backspace, percentage]);

  useEffect(() => {
    document.addEventListener('keydown', handleKeyPress);
    return () => {
      document.removeEventListener('keydown', handleKeyPress);
    };
  }, [handleKeyPress]);

  return (
    <div className="flex gap-4 max-w-4xl mx-auto">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle className="text-center flex items-center justify-between">
            Calculator
            <Button 
              variant="ghost" 
              size="sm" 
              onClick={() => setShowHistory(!showHistory)}
              className="text-sm"
            >
              History
            </Button>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="bg-gray-100 dark:bg-gray-800 p-4 rounded-lg text-right space-y-2">
            {error && (
              <div className="text-red-500 text-sm font-normal">
                {error}
              </div>
            )}
            <div className="text-2xl font-mono break-all">
              {display}
            </div>
            {operation && previousValue !== null && (
              <div className="text-sm text-gray-500 font-mono">
                {previousValue} {operation}
              </div>
            )}
          </div>
          
          <div className="grid grid-cols-4 gap-2">
            <Button variant="secondary" onClick={clear} className="col-span-1" title="Clear (Esc)">
              C
            </Button>
            <Button variant="secondary" onClick={backspace} title="Backspace">
              ⌫
            </Button>
            <Button variant="secondary" onClick={() => performOperation('÷')} title="Divide (/)">
              ÷
            </Button>
            <Button variant="secondary" onClick={() => performOperation('×')} title="Multiply (*)">
              ×
            </Button>
            
            <Button variant="outline" onClick={() => inputNumber('7')} title="7">
              7
            </Button>
            <Button variant="outline" onClick={() => inputNumber('8')} title="8">
              8
            </Button>
            <Button variant="outline" onClick={() => inputNumber('9')} title="9">
              9
            </Button>
            <Button variant="secondary" onClick={() => performOperation('-')} title="Subtract (-)">
              -
            </Button>
            
            <Button variant="outline" onClick={() => inputNumber('4')} title="4">
              4
            </Button>
            <Button variant="outline" onClick={() => inputNumber('5')} title="5">
              5
            </Button>
            <Button variant="outline" onClick={() => inputNumber('6')} title="6">
              6
            </Button>
            <Button variant="secondary" onClick={() => performOperation('+')} title="Add (+)">
              +
            </Button>
            
            <Button variant="outline" onClick={() => inputNumber('1')} title="1">
              1
            </Button>
            <Button variant="outline" onClick={() => inputNumber('2')} title="2">
              2
            </Button>
            <Button variant="outline" onClick={() => inputNumber('3')} title="3">
              3
            </Button>
            <Button variant="default" onClick={handleEquals} className="row-span-2" title="Equals (Enter)">
              =
            </Button>
            
            <Button variant="outline" onClick={toggleSign} title="Toggle Sign">
              ±
            </Button>
            <Button variant="outline" onClick={() => inputNumber('0')} title="0">
              0
            </Button>
            <Button variant="outline" onClick={inputDecimal} title="Decimal (.)">
              .
            </Button>
          </div>
          
          <div className="grid grid-cols-3 gap-2 pt-2 border-t">
            <Button variant="secondary" onClick={percentage} title="Percentage (%)">
              %
            </Button>
            <Button variant="secondary" onClick={squareRoot} title="Square Root">
              √
            </Button>
            <Button variant="secondary" onClick={clearHistory} title="Clear History" size="sm">
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        </CardContent>
      </Card>
      
      {showHistory && (
        <Card className="w-full max-w-sm">
          <CardHeader>
            <CardTitle className="text-center text-lg">History</CardTitle>
          </CardHeader>
          <CardContent>
            <ScrollArea className="h-96">
              {history.length === 0 ? (
                <div className="text-center text-gray-500 py-8">
                  No calculations yet
                </div>
              ) : (
                <div className="space-y-2">
                  {history.map((item, index) => (
                    <div key={index} className="p-2 bg-gray-50 dark:bg-gray-800 rounded text-sm">
                      <div className="text-gray-600 dark:text-gray-400 font-mono">
                        {item.expression}
                      </div>
                      <div className="font-mono font-semibold">
                        = {item.result}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </ScrollArea>
          </CardContent>
        </Card>
      )}
    </div>
  );
}