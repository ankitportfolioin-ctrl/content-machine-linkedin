import React, { useEffect, useState } from 'react';
import { AlertCircle, CalendarClock, CheckCircle2, ExternalLink, FileSearch, Play, RefreshCw, ShieldCheck, Sparkles, Zap } from 'lucide-react';
import { api, ConfigResponse, ScheduleResult } from '../../services/api';

interface AutomationHubViewProps {
  currentPost: string;
  onPostScheduled?: () => void;
  onLoadPostToEditor?: (text: string) => void;
}

const formatDate = (value?: string | null) => value ? new Date(value).toLocaleString() : 'Date unavailable';

export const AutomationHubView: React.FC<AutomationHubViewProps> = ({ currentPost, onPostScheduled, onLoadPostToEditor }) => {
  const [config, setConfig] = useState<ConfigResponse | null>(null);
  const [profile, setProfile] = useState<any>(null);
  const [discovery, setDiscovery] = useState<any>(null);
  const [history, setHistory] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [dryRun, setDryRun] = useState(true);
  const [scheduledTime, setScheduledTime] = useState('');
  const [message, setMessage] = useState<{ kind: 'success' | 'error'; text: string } | null>(null);

  const load = async () => {
    const [cfg, p, hist] = await Promise.all([api.getConfig(), api.getVoiceProfile(), api.getHistory()]);
    setConfig(cfg); setProfile(p); setHistory(hist.history || []);
    if (cfg.credentials.publoraConfigured && cfg.credentials.platformIdConfigured) setDryRun(false);
  };

  useEffect(() => { load().catch(() => undefined); }, []);

  const discover = async () => {
    setLoading(true); setMessage(null);
    try { setDiscovery(await api.discoverLatest(profile?.contentPillars)); setMessage({ kind: 'success', text: 'Fresh public sources loaded and matched to your content pillars.' }); }
    catch (error: any) { setMessage({ kind: 'error', text: error.message }); }
    finally { setLoading(false); }
  };

  const runPipeline = async () => {
    setLoading(true); setMessage(null);
    try {
      const result = await api.runDailyRoutine({ dryRun, scheduledTime: scheduledTime || undefined });
      setDiscovery(result.discovery);
      onLoadPostToEditor?.(result.draft);
      await load();
      setMessage({ kind: 'success', text: `${result.scheduleResult.isDryRun ? 'Preview ready' : 'Published to LinkedIn'}: ${result.topic}` });
      onPostScheduled?.();
    } catch (error: any) { setMessage({ kind: 'error', text: error.message }); }
    finally { setLoading(false); }
  };

  const publishCurrent = async () => {
    setLoading(true); setMessage(null);
    try {
      const result: ScheduleResult = await api.postNow({ content: currentPost, dryRun });
      setMessage({ kind: 'success', text: `${result.isDryRun ? 'Preview validated' : 'Published to LinkedIn'}: ${result.postId}` });
      await load();
      onPostScheduled?.();
    } catch (error: any) { setMessage({ kind: 'error', text: error.message }); }
    finally { setLoading(false); }
  };

  const liveReady = Boolean(config?.credentials.publoraConfigured && config?.credentials.platformIdConfigured);
  const items = discovery?.items || [];

  return (
    <div className="space-y-5">
      <section className="rounded-2xl border border-slate-800 bg-slate-900 p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <Zap className="h-5 w-5 text-blue-400" />
              <h2 className="text-xl font-bold text-white">Automated content pipeline</h2>
              <span className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold ${liveReady && !dryRun ? 'border-emerald-800 bg-emerald-950 text-emerald-300' : 'border-amber-800 bg-amber-950 text-amber-300'}`}>
                {liveReady && !dryRun ? 'Live publishing enabled' : 'Safe preview mode'}
              </span>
            </div>
            <p className="mt-1 max-w-3xl text-sm text-slate-400">Find fresh public-source content, match it to your pillars, draft with your voice, run checks, and publish or schedule it through LinkedIn.</p>
          </div>
          <button onClick={discover} disabled={loading} className="inline-flex items-center justify-center gap-2 rounded-lg border border-slate-700 bg-slate-800 px-4 py-2 text-sm font-semibold text-slate-100 hover:bg-slate-700 disabled:opacity-50"><RefreshCw className={loading ? 'h-4 w-4 animate-spin' : 'h-4 w-4'} />Refresh sources</button>
        </div>
      </section>

      {message && <div className={`flex items-center gap-2 rounded-xl border p-3 text-sm ${message.kind === 'success' ? 'border-emerald-800 bg-emerald-950/40 text-emerald-200' : 'border-rose-800 bg-rose-950/40 text-rose-200'}`}>{message.kind === 'success' ? <CheckCircle2 className="h-4 w-4" /> : <AlertCircle className="h-4 w-4" />}{message.text}</div>}

      <section className="grid grid-cols-1 gap-3 md:grid-cols-4">
        <div className="rounded-xl border border-slate-800 bg-slate-900 p-4"><p className="text-xs text-slate-500">Content pillars</p><p className="mt-1 text-lg font-bold text-white">{profile?.contentPillars?.length || 0}</p><p className="mt-1 truncate text-xs text-slate-400">{profile?.contentPillars?.join(' • ') || 'Configure in Profile'}</p></div>
        <div className="rounded-xl border border-slate-800 bg-slate-900 p-4"><p className="text-xs text-slate-500">Sources checked</p><p className="mt-1 text-lg font-bold text-white">{discovery?.sourcesChecked || 0}</p><p className="mt-1 text-xs text-slate-400">RSS and public feeds</p></div>
        <div className="rounded-xl border border-slate-800 bg-slate-900 p-4"><p className="text-xs text-slate-500">Fresh items</p><p className="mt-1 text-lg font-bold text-white">{items.length}</p><p className="mt-1 text-xs text-slate-400">{discovery ? `Fetched ${formatDate(discovery.fetchedAt)}` : 'Refresh to discover'}</p></div>
        <div className="rounded-xl border border-slate-800 bg-slate-900 p-4"><p className="text-xs text-slate-500">LinkedIn connection</p><p className={`mt-1 text-lg font-bold ${liveReady ? 'text-emerald-400' : 'text-amber-400'}`}>{liveReady ? 'Ready' : 'Not configured'}</p><p className="mt-1 truncate text-xs text-slate-400">{config?.credentials.platformIdValue || 'Add Publora + channel ID'}</p></div>
      </section>

      <section className="grid grid-cols-1 gap-5 lg:grid-cols-5">
        <div className="space-y-5 lg:col-span-3">
          <div className="rounded-2xl border border-slate-800 bg-slate-900 p-5">
            <div className="mb-4 flex items-center gap-2"><Sparkles className="h-5 w-5 text-blue-400" /><h3 className="font-bold text-white">One-click source-to-post run</h3></div>
            <ol className="mb-5 grid gap-2 text-sm text-slate-300 sm:grid-cols-4"><li className="rounded-lg bg-slate-950 p-3"><b className="text-blue-300">1. Find</b><br />Read current public sources</li><li className="rounded-lg bg-slate-950 p-3"><b className="text-blue-300">2. Match</b><br />Map items to pillars</li><li className="rounded-lg bg-slate-950 p-3"><b className="text-blue-300">3. Draft</b><br />Use voice and angle</li><li className="rounded-lg bg-slate-950 p-3"><b className="text-blue-300">4. Publish</b><br />Schedule or simulate</li></ol>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="text-xs text-slate-400">Optional scheduled time<input type="datetime-local" value={scheduledTime} onChange={e => setScheduledTime(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 p-2.5 text-white" /></label>
              <label className="flex items-center gap-2 self-end rounded-lg border border-slate-800 bg-slate-950 p-3 text-xs"><input type="checkbox" checked={dryRun} onChange={e => setDryRun(e.target.checked)} /><span className={dryRun ? 'text-amber-300' : 'text-slate-300'}>{dryRun ? 'Safe preview: do not publish' : 'Live: send to LinkedIn'}</span></label>
            </div>
            <button onClick={runPipeline} disabled={loading} className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-3 text-sm font-bold text-white hover:bg-blue-500 disabled:opacity-50"><Play className="h-4 w-4" />{loading ? 'Running pipeline…' : dryRun ? 'Find, draft, and preview' : 'Find, draft, and publish'}</button>
            {!liveReady && <p className="mt-3 flex items-center gap-2 text-xs text-amber-300"><ShieldCheck className="h-4 w-4" />Live publishing stays unavailable until Publora and a LinkedIn channel are configured.</p>}
          </div>

          <div className="rounded-2xl border border-slate-800 bg-slate-900 p-5"><div className="mb-3 flex items-center gap-2"><CalendarClock className="h-5 w-5 text-blue-400" /><h3 className="font-bold text-white">Publish the current editor draft</h3></div><p className="mb-3 line-clamp-4 rounded-lg border border-slate-800 bg-slate-950 p-3 text-sm leading-relaxed text-slate-300">{currentPost || 'No draft in the editor yet.'}</p><button onClick={publishCurrent} disabled={loading || !currentPost} className="inline-flex items-center gap-2 rounded-lg border border-slate-700 bg-slate-800 px-4 py-2 text-sm font-semibold text-slate-100 hover:bg-slate-700 disabled:opacity-50"><CalendarClock className="h-4 w-4" />{dryRun ? 'Validate current draft' : 'Publish current draft'}</button></div>
        </div>

        <div className="space-y-5 lg:col-span-2">
          <div className="rounded-2xl border border-slate-800 bg-slate-900 p-5"><div className="mb-3 flex items-center gap-2"><FileSearch className="h-5 w-5 text-blue-400" /><h3 className="font-bold text-white">Latest matched sources</h3></div>{items.length === 0 ? <p className="text-sm text-slate-400">Click “Refresh sources” to load current items from the configured public feeds.</p> : <div className="max-h-[520px] space-y-3 overflow-y-auto pr-1">{items.map((item: any, index: number) => <article key={`${item.url}-${index}`} className="rounded-lg border border-slate-800 bg-slate-950 p-3"><div className="flex items-start justify-between gap-2"><p className="text-sm font-semibold text-slate-100">{item.title}</p><a href={item.url} target="_blank" rel="noreferrer" className="shrink-0 text-blue-400"><ExternalLink className="h-4 w-4" /></a></div><p className="mt-1 text-[11px] text-blue-300">{item.matchedPillar} • {item.source} • {formatDate(item.publishedAt)}</p><p className="mt-2 text-xs leading-relaxed text-slate-400">{item.summary || 'No summary provided by source.'}</p></article>)}</div>}</div>
          <div className="rounded-2xl border border-slate-800 bg-slate-900 p-5"><h3 className="mb-3 font-bold text-white">Recent runs</h3>{history.length === 0 ? <p className="text-sm text-slate-400">No runs yet.</p> : <div className="space-y-2">{history.slice(0, 6).map((item: any, index: number) => <div key={`${item.post_id}-${index}`} className="flex items-center justify-between gap-3 rounded-lg bg-slate-950 p-3 text-xs"><span className="truncate text-slate-300">{item.angle || 'manual'}<br /><span className="text-slate-500">{item.is_dry_run ? 'Preview' : 'Live'} • {item.chars} chars</span></span><span className="shrink-0 text-slate-500">{formatDate(item.date)}</span></div>)}</div>}</div>
        </div>
      </section>
    </div>
  );
};
