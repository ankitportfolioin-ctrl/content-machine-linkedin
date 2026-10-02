import { parseStringPromise } from 'xml2js';

const opts = { explicitArray: false, mergeAttrs: true, trim: true };

const cases: Record<string, string> = {
  atomContentHtml: `<feed><entry><content type="html"><p>Bundles <tt>x</tt>.</p></content></entry></feed>`,
  atomContentText: `<feed><entry><content type="text">Plain release text</content></entry></feed>`,
  atomContentPlain: `<feed><entry><content> bare text </content></entry></feed>`,
  atomSummaryHtml: `<feed><entry><summary type="html"><p>Sum <b>y</b></p></summary></entry></feed>`,
  atomEmptyContentAttrOnly: `<feed><entry><content type="html"/></entry></feed>`,
  rssContentEncodedCdata: `<rss><channel><item><content:encoded><![CDATA[<p>Real body</p>]]></content:encoded></item></channel></rss>`,
  rssContentEncodedTyped: `<rss><channel><item><content:encoded type="html"><p>Typed</p></content:encoded></item></channel></rss>`,
  rssDescriptionPlain: `<rss><channel><item><description>Just text</description></item></channel></rss>`,
  rssDescriptionNested: `<rss><channel><item><description><p>Para one</p><p>Para two</p></description></item></channel></rss>`,
  rssTitleAttr: `<rss><channel><item><title foo="bar">Titled</title></item></channel></rss>`,
};

for (const [name, xml] of Object.entries(cases)) {
  const parsed: any = await parseStringPromise(xml, opts);
  const node = parsed.feed?.entry ?? parsed.rss?.channel?.item;
  const probe =
    node.content ?? node['content:encoded'] ?? node.summary ?? node.description ?? node.title ?? null;
  console.log(name, '=>', JSON.stringify(probe));
}
