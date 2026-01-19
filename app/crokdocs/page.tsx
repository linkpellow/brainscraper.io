'use client';

import { useState, useEffect } from 'react';
import AppLayout from '../components/AppLayout';
import { Phone, CheckCircle, XCircle, Clock } from 'lucide-react';

// Seeded random number generator for consistent daily values
function seededRandom(seed: number) {
  let value = seed;
  return () => {
    value = (value * 9301 + 49297) % 233280;
    return value / 233280;
  };
}

export default function CrokDocsPage() {
  const [dials, setDials] = useState<number>(0);
  const [positiveContacts, setPositiveContacts] = useState<number>(0);
  const [negativeContacts, setNegativeContacts] = useState<number>(0);
  const [currentTime, setCurrentTime] = useState<Date>(new Date());

  useEffect(() => {
    const updateStats = () => {
      const now = new Date();
      setCurrentTime(now);
      
      // Use date as seed for consistent daily values
      const dateStr = now.toISOString().split('T')[0]; // YYYY-MM-DD
      const seed = dateStr.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
      const random = seededRandom(seed);
      
      // Check if it's Saturday (day 6)
      const isSaturday = now.getDay() === 6;
      
      // Base dials for the day (200-400 on Saturday, 400-600 otherwise)
      const baseDials = isSaturday 
        ? 200 + Math.floor(random() * 201)  // 200-400 on Saturday
        : 400 + Math.floor(random() * 201); // 400-600 on other days
      
      // Calculate time-based increment (8am to 8pm = 12 hours)
      const hours = now.getHours();
      const minutes = now.getMinutes();
      const currentHour = hours + minutes / 60;
      
      let timeBasedDials = 0;
      if (currentHour >= 8 && currentHour < 20) {
        // Between 8am and 8pm
        const hoursSince8am = currentHour - 8;
        const progress = hoursSince8am / 12; // 0 to 1
        
        // Random increment per hour (between 15-35 dials per hour)
        const dialsPerHour = 15 + Math.floor(random() * 21);
        timeBasedDials = Math.floor(progress * 12 * dialsPerHour);
      } else if (currentHour >= 20) {
        // After 8pm, use full day's dials
        timeBasedDials = Math.floor(12 * (15 + random() * 21));
      }
      
      const totalDials = baseDials + timeBasedDials;
      setDials(totalDials);

      // Calculate positive contacts (between 4 and 30, but proportional to dials)
      const minPositive = 4;
      const maxPositive = Math.min(30, Math.floor(totalDials * 0.075));
      const positive = minPositive + Math.floor(random() * (maxPositive - minPositive + 1));
      setPositiveContacts(positive);

      // Negative contacts = total dials - positive contacts
      setNegativeContacts(totalDials - positive);
    };

    updateStats();
    // Update every minute to show real-time increments
    const interval = setInterval(updateStats, 60000);
    
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    // Override body background for this page
    document.body.style.backgroundColor = '#0d3d0d';
    // Neural Pin Field background is handled by AppLayout
    // No need to hide it here as it's already behind content
    
    return () => {
      document.body.style.backgroundColor = '';
    };
  }, []);

  return (
    <div style={{ backgroundColor: '#0d3d0d', minHeight: '100vh', width: '100%' }}>
      <AppLayout>
        <div className="w-full px-4 sm:px-6 lg:px-8 py-8" style={{ backgroundColor: '#0d3d0d', minHeight: '100vh' }}>
          <div className="max-w-5xl mx-auto space-y-6">
          {/* Header */}
          <div className="text-center space-y-3 animate-fade-in">
            <div className="flex items-center justify-center gap-3 mb-2">
              <div className="p-3 rounded-xl" style={{ 
                background: 'linear-gradient(135deg, rgba(255, 215, 0, 0.2) 0%, rgba(255, 215, 0, 0.1) 100%)',
                border: '1px solid rgba(255, 215, 0, 0.3)',
                boxShadow: '0 4px 16px rgba(0, 0, 0, 0.3), 0 0 24px rgba(255, 215, 0, 0.2)'
              }}>
                <Phone className="w-6 h-6" style={{ color: '#ffd700' }} />
              </div>
              <h1 className="text-3xl sm:text-4xl md:text-5xl font-bold tracking-tight" style={{ 
                color: '#ffd700',
                textShadow: '0 0 20px rgba(255, 215, 0, 0.5), 0 0 40px rgba(255, 215, 0, 0.3)'
              }}>
                CrokDocs
              </h1>
            </div>
            <p className="text-sm sm:text-base font-medium" style={{ color: '#ffd700', opacity: 0.9 }}>
              Dialing Statistics Dashboard
            </p>
            <div className="flex items-center justify-center gap-2 text-xs" style={{ color: '#ffd700', opacity: 0.7 }}>
              <Clock className="w-3 h-3" />
              <span>Last updated: {currentTime.toLocaleTimeString()}</span>
            </div>
          </div>

          {/* Stats Cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {/* Total Dials */}
            <div 
              className="rounded-xl p-8 aspect-square flex flex-col items-center justify-center transition-all duration-300 hover:scale-105"
              style={{ 
                background: 'linear-gradient(135deg, rgba(26, 77, 26, 0.8) 0%, rgba(13, 61, 13, 0.9) 50%, rgba(26, 77, 26, 0.8) 100%)',
                backdropFilter: 'blur(16px)',
                border: '1px solid rgba(255, 215, 0, 0.4)',
                boxShadow: '0 8px 32px rgba(0, 0, 0, 0.5), 0 0 24px rgba(255, 215, 0, 0.2), inset 0 2px 8px rgba(255, 215, 0, 0.1), inset 0 -2px 8px rgba(0, 0, 0, 0.3)',
                transform: 'perspective(1000px) translateZ(0)'
              }}
            >
              <div className="p-4 rounded-full mb-4" style={{ 
                background: 'linear-gradient(135deg, rgba(255, 215, 0, 0.2) 0%, rgba(255, 215, 0, 0.1) 100%)',
                boxShadow: '0 0 20px rgba(255, 215, 0, 0.3)'
              }}>
                <Phone className="w-10 h-10" style={{ color: '#ffd700' }} />
              </div>
              <div className="text-center">
                <div className="text-5xl font-bold mb-2" style={{ 
                  color: '#ffd700',
                  textShadow: '0 0 16px rgba(255, 215, 0, 0.6)'
                }}>
                  {dials.toLocaleString()}
                </div>
                <div className="text-base font-semibold uppercase tracking-wider" style={{ color: '#ffd700', opacity: 0.9 }}>
                  Dials
                </div>
              </div>
            </div>

            {/* Positive Contacts */}
            <div 
              className="rounded-xl p-8 aspect-square flex flex-col items-center justify-center transition-all duration-300 hover:scale-105"
              style={{ 
                background: 'linear-gradient(135deg, rgba(26, 77, 26, 0.8) 0%, rgba(13, 61, 13, 0.9) 50%, rgba(26, 77, 26, 0.8) 100%)',
                backdropFilter: 'blur(16px)',
                border: '1px solid rgba(255, 215, 0, 0.4)',
                boxShadow: '0 8px 32px rgba(0, 0, 0, 0.5), 0 0 24px rgba(255, 215, 0, 0.2), inset 0 2px 8px rgba(255, 215, 0, 0.1), inset 0 -2px 8px rgba(0, 0, 0, 0.3)',
                transform: 'perspective(1000px) translateZ(0)'
              }}
            >
              <div className="p-4 rounded-full mb-4" style={{ 
                background: 'linear-gradient(135deg, rgba(255, 215, 0, 0.2) 0%, rgba(255, 215, 0, 0.1) 100%)',
                boxShadow: '0 0 20px rgba(255, 215, 0, 0.3)'
              }}>
                <CheckCircle className="w-10 h-10" style={{ color: '#ffd700' }} />
              </div>
              <div className="text-center">
                <div className="text-5xl font-bold mb-2" style={{ 
                  color: '#ffd700',
                  textShadow: '0 0 16px rgba(255, 215, 0, 0.6)'
                }}>
                  {positiveContacts.toLocaleString()}
                </div>
                <div className="text-base font-semibold uppercase tracking-wider" style={{ color: '#ffd700', opacity: 0.9 }}>
                  Positive Contacts
                </div>
              </div>
            </div>

            {/* Negative Contacts */}
            <div 
              className="rounded-xl p-8 aspect-square flex flex-col items-center justify-center transition-all duration-300 hover:scale-105"
              style={{ 
                background: 'linear-gradient(135deg, rgba(26, 77, 26, 0.8) 0%, rgba(13, 61, 13, 0.9) 50%, rgba(26, 77, 26, 0.8) 100%)',
                backdropFilter: 'blur(16px)',
                border: '1px solid rgba(255, 215, 0, 0.4)',
                boxShadow: '0 8px 32px rgba(0, 0, 0, 0.5), 0 0 24px rgba(255, 215, 0, 0.2), inset 0 2px 8px rgba(255, 215, 0, 0.1), inset 0 -2px 8px rgba(0, 0, 0, 0.3)',
                transform: 'perspective(1000px) translateZ(0)'
              }}
            >
              <div className="p-4 rounded-full mb-4" style={{ 
                background: 'linear-gradient(135deg, rgba(255, 215, 0, 0.2) 0%, rgba(255, 215, 0, 0.1) 100%)',
                boxShadow: '0 0 20px rgba(255, 215, 0, 0.3)'
              }}>
                <XCircle className="w-10 h-10" style={{ color: '#ffd700' }} />
              </div>
              <div className="text-center">
                <div className="text-5xl font-bold mb-2" style={{ 
                  color: '#ffd700',
                  textShadow: '0 0 16px rgba(255, 215, 0, 0.6)'
                }}>
                  {negativeContacts.toLocaleString()}
                </div>
                <div className="text-base font-semibold uppercase tracking-wider" style={{ color: '#ffd700', opacity: 0.9 }}>
                  Negative Contacts
                </div>
              </div>
            </div>
          </div>

          {/* Summary Stats */}
          <div 
            className="rounded-xl p-6 transition-all duration-300"
            style={{ 
              background: 'linear-gradient(135deg, rgba(26, 77, 26, 0.8) 0%, rgba(13, 61, 13, 0.9) 50%, rgba(26, 77, 26, 0.8) 100%)',
              backdropFilter: 'blur(16px)',
              border: '1px solid rgba(255, 215, 0, 0.4)',
              boxShadow: '0 8px 32px rgba(0, 0, 0, 0.5), 0 0 24px rgba(255, 215, 0, 0.2), inset 0 2px 8px rgba(255, 215, 0, 0.1), inset 0 -2px 8px rgba(0, 0, 0, 0.3)',
              transform: 'perspective(1000px) translateZ(0)'
            }}
          >
            <h2 className="text-xl font-bold mb-6 flex items-center gap-2" style={{ color: '#ffd700' }}>
              <div className="w-1 h-6 rounded-full" style={{ background: 'linear-gradient(180deg, #ffd700 0%, rgba(255, 215, 0, 0.5) 100%)' }} />
              Summary Statistics
            </h2>
            <div className="space-y-4">
              <div className="flex justify-between items-center p-3 rounded-lg" style={{ 
                background: 'rgba(255, 215, 0, 0.05)',
                border: '1px solid rgba(255, 215, 0, 0.2)'
              }}>
                <span className="text-sm font-semibold uppercase tracking-wider" style={{ color: '#ffd700', opacity: 0.9 }}>
                  Positive Contact Rate:
                </span>
                <span className="text-xl font-bold" style={{ 
                  color: '#ffd700',
                  textShadow: '0 0 12px rgba(255, 215, 0, 0.5)'
                }}>
                  {dials > 0 ? ((positiveContacts / dials) * 100).toFixed(2) : '0.00'}%
                </span>
              </div>
              <div className="flex justify-between items-center p-3 rounded-lg" style={{ 
                background: 'rgba(255, 215, 0, 0.05)',
                border: '1px solid rgba(255, 215, 0, 0.2)'
              }}>
                <span className="text-sm font-semibold uppercase tracking-wider" style={{ color: '#ffd700', opacity: 0.9 }}>
                  Negative Contact Rate:
                </span>
                <span className="text-xl font-bold" style={{ 
                  color: '#ffd700',
                  textShadow: '0 0 12px rgba(255, 215, 0, 0.5)'
                }}>
                  {dials > 0 ? ((negativeContacts / dials) * 100).toFixed(2) : '0.00'}%
                </span>
              </div>
            </div>
          </div>
          </div>
        </div>
      </AppLayout>
    </div>
  );
}
