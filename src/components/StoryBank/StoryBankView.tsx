import React, { useState } from 'react';
import { StoryBankItem } from '../../types/skills';
import { BookOpen, Plus, Trash2, ArrowRight, Check, Sparkles } from 'lucide-react';

interface StoryBankViewProps {
  onInsertToPost: (content: string) => void;
}

export const StoryBankView: React.FC<StoryBankViewProps> = ({ onInsertToPost }) => {
  const [stories, setStories] = useState<StoryBankItem[]>(() => {
    try {
      const saved = localStorage.getItem('copilot_user_stories');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  
  // New Story Form State
  const [isAdding, setIsAdding] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newCategory, setNewCategory] = useState<StoryBankItem['category']>('Scar / Failure');
  const [newDate, setNewDate] = useState('');
  const [newDetails, setNewDetails] = useState('');
  const [newFact, setNewFact] = useState('');

  const saveStories = (updated: StoryBankItem[]) => {
    setStories(updated);
    try {
      localStorage.setItem('copilot_user_stories', JSON.stringify(updated));
    } catch (e) {
      console.warn('Failed to save stories to localStorage:', e);
    }
  };

  const handleAddStory = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim() || !newDetails.trim()) return;

    const newItem: StoryBankItem = {
      id: `custom-${Date.now()}`,
      title: newTitle,
      category: newCategory,
      dateOrYear: newDate || '2026',
      rawDetails: newDetails,
      uncomfortableFact: newFact
    };

    saveStories([newItem, ...stories]);
    setNewTitle('');
    setNewDetails('');
    setNewFact('');
    setNewDate('');
    setIsAdding(false);
  };

  const handleDelete = (id: string) => {
    saveStories(stories.filter(s => s.id !== id));
  };

  const filtered = selectedCategory === 'all'
    ? stories
    : stories.filter(s => s.category === selectedCategory);

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <BookOpen className="w-5 h-5 text-indigo-400" />
            <h2 className="text-lg font-bold text-white">Story Bank & Career Interviewer</h2>
            <span className="text-xs bg-indigo-950 text-indigo-300 border border-indigo-800 px-2 py-0.5 rounded-full font-mono">
              Uncomfortable Facts & Receipts
            </span>
          </div>
          <p className="text-xs text-slate-400 mt-0.5">
            Store concrete numbers, raw receipts, and turning points so your posts never rely on manufactured fluff.
          </p>
        </div>

        <button
          onClick={() => setIsAdding(!isAdding)}
          className="px-3.5 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-xs flex items-center gap-1.5 cursor-pointer transition shadow-md shadow-indigo-600/20"
        >
          <Plus className="w-3.5 h-3.5" />
          {isAdding ? 'Close Form' : 'Add Story or Receipt'}
        </button>
      </div>

      {/* Add Story Drawer Form */}
      {isAdding && (
        <form onSubmit={handleAddStory} className="bg-slate-900 border border-indigo-800/80 rounded-xl p-5 space-y-4 shadow-xl">
          <h3 className="font-bold text-white text-sm">Log a Concrete Career Story or Receipt</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
            <div>
              <label className="text-slate-400 block mb-1">Story Title / Metric:</label>
              <input
                type="text"
                placeholder="e.g. $42k Cloud Bill Pivot"
                value={newTitle}
                onChange={e => setNewTitle(e.target.value)}
                required
                className="w-full bg-slate-950 border border-slate-800 rounded p-2 text-white focus:border-indigo-500 focus:outline-none"
              />
            </div>
            <div>
              <label className="text-slate-400 block mb-1">Category:</label>
              <select
                value={newCategory}
                onChange={e => setNewCategory(e.target.value as StoryBankItem['category'])}
                className="w-full bg-slate-950 border border-slate-800 rounded p-2 text-white focus:border-indigo-500 focus:outline-none"
              >
                <option value="Scar / Failure">Scar / Failure</option>
                <option value="Odd-Precision Receipt">Odd-Precision Receipt</option>
                <option value="Contrarian Stance">Contrarian Stance</option>
                <option value="Turning Point">Turning Point</option>
                <option value="Client / Team Metric">Client / Team Metric</option>
              </select>
            </div>
            <div>
              <label className="text-slate-400 block mb-1">Specific Date or Month/Year:</label>
              <input
                type="text"
                placeholder="e.g. October 2024"
                value={newDate}
                onChange={e => setNewDate(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded p-2 text-white focus:border-indigo-500 focus:outline-none"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
            <div>
              <label className="text-slate-400 block mb-1">Raw Details & Specific Figures:</label>
              <textarea
                rows={3}
                placeholder="What exactly happened? Include exact numbers, metrics, or mechanisms..."
                value={newDetails}
                onChange={e => setNewDetails(e.target.value)}
                required
                className="w-full bg-slate-950 border border-slate-800 rounded p-2 text-white focus:border-indigo-500 focus:outline-none"
              />
            </div>
            <div>
              <label className="text-slate-400 block mb-1">Flat, Dated Uncomfortable Fact:</label>
              <textarea
                rows={3}
                placeholder="What is the blunt truth or mistake you made? (No buzzwords or false vulnerability)"
                value={newFact}
                onChange={e => setNewFact(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded p-2 text-white focus:border-indigo-500 focus:outline-none"
              />
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={() => setIsAdding(false)}
              className="px-3 py-1.5 rounded bg-slate-800 text-slate-300 text-xs hover:bg-slate-700 cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-4 py-1.5 rounded bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-xs cursor-pointer"
            >
              Save to Story Bank
            </button>
          </div>
        </form>
      )}

      {/* Filter Category Tabs */}
      <div className="flex items-center gap-1 overflow-x-auto pb-1 text-xs">
        {['all', 'Scar / Failure', 'Odd-Precision Receipt', 'Contrarian Stance', 'Turning Point'].map(cat => (
          <button
            key={cat}
            onClick={() => setSelectedCategory(cat)}
            className={`px-3 py-1 rounded-lg capitalize whitespace-nowrap cursor-pointer transition ${
              selectedCategory === cat
                ? 'bg-indigo-950 text-indigo-300 border border-indigo-800 font-semibold'
                : 'text-slate-400 hover:text-slate-200 bg-slate-900 border border-slate-800'
            }`}
          >
            {cat}
          </button>
        ))}
      </div>

      {/* Story Cards Grid */}
      {filtered.length === 0 ? (
        <div className="p-8 rounded-xl bg-slate-900 border border-slate-800 text-center space-y-3">
          <BookOpen className="w-8 h-8 text-slate-600 mx-auto" />
          <div className="space-y-1">
            <h4 className="text-sm font-semibold text-white">No stories or receipts saved yet</h4>
            <p className="text-xs text-slate-400 max-w-md mx-auto">
              Store real operational moments, turning points, failures, or odd-precision numbers to ground your posts in undeniable credibility.
            </p>
          </div>
          <button
            onClick={() => setIsAdding(true)}
            className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Add your first story</span>
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {filtered.map(story => (
            <div
              key={story.id}
              className="bg-slate-900 border border-slate-800 rounded-xl p-4 flex flex-col justify-between space-y-3 hover:border-slate-700 transition"
            >
              <div className="space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-slate-950 text-indigo-400 border border-slate-800">
                    {story.category}
                  </span>
                  <span className="text-xs text-slate-400 font-mono">{story.dateOrYear}</span>
                </div>

                <h3 className="font-bold text-white text-base leading-snug">{story.title}</h3>
                <p className="text-xs text-slate-300 leading-relaxed font-sans">{story.rawDetails}</p>

                {story.uncomfortableFact && (
                  <div className="p-2.5 rounded bg-slate-950 border border-slate-800/80 text-[11px] text-amber-200">
                    <strong className="text-amber-300">Uncomfortable Fact:</strong> {story.uncomfortableFact}
                  </div>
                )}
              </div>

              <div className="pt-3 border-t border-slate-800/80 flex items-center justify-between text-xs">
                <button
                  onClick={() => handleDelete(story.id)}
                  className="text-slate-500 hover:text-rose-400 p-1 rounded cursor-pointer"
                  title="Delete story"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>

                <button
                  onClick={() => {
                    const postSnippet = `On ${story.dateOrYear}, here is what happened:\n\n${story.rawDetails}\n\nThe blunt lesson:\n${story.uncomfortableFact}\n\nWhat is a failure or turning point that completely reset how you operate?`;
                    onInsertToPost(postSnippet);
                  }}
                  className="px-3 py-1.5 rounded bg-indigo-950 hover:bg-indigo-900/60 text-indigo-300 border border-indigo-800 text-xs font-medium flex items-center gap-1 cursor-pointer transition"
                >
                  <span>Draft Post from Story</span>
                  <ArrowRight className="w-3 h-3" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
