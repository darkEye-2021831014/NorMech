'use client';

import { useEffect, useState } from 'react';
import { Sun, Moon } from 'lucide-react';
import { useReducedMotion, motion } from 'framer-motion';

export function ThemeToggle() {
  const [dark, setDark] = useState(false);
  const reduce = useReducedMotion();

  useEffect(() => {
    setDark(document.documentElement.classList.contains('dark'));
  }, []);

  const toggle = () => {
    const next = !dark;
    setDark(next);
    if (next) {
      document.documentElement.classList.add('dark');
      localStorage.setItem('theme', 'dark');
    } else {
      document.documentElement.classList.remove('dark');
      localStorage.setItem('theme', 'light');
    }
  };

  return (
    <motion.button
      onClick={toggle}
      whileTap={reduce ? undefined : { scale: 0.95 }}
      aria-label={dark ? 'Switch to paper' : 'Switch to ink'}
      className="btn-touch inline-flex items-center justify-center w-11 h-11 border border-ink/30 hover:border-ink rounded-sm text-ink transition-colors"
    >
      {dark ? <Sun size={16} strokeWidth={1.5} /> : <Moon size={16} strokeWidth={1.5} />}
    </motion.button>
  );
}
