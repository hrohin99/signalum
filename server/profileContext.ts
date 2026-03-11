export function buildProfileContext(workspace: any): string {
  if (!workspace) return '';
  const p = workspace.userPerspective || workspace.user_perspective || '';
  const org = workspace.orgDescription || workspace.org_description || '';
  const rawGeos = workspace.orgGeographies || workspace.org_geographies || [];
  const geos = (Array.isArray(rawGeos) ? rawGeos : []).join(', ') || 'their target geographies';
  const trackingTypes = workspace.trackingTypes || workspace.tracking_types || [];
  const earlyWarning = workspace.earlyWarningSignal || workspace.early_warning_signal || '';

  let ctx = `CUSTOMER CONTEXT — personalise all analysis to this, never make generic statements:\n`;
  ctx += org ? `Organisation: ${org}\n` : '';
  ctx += geos ? `Geographies: ${geos}\n` : '';
  ctx += trackingTypes.length ? `Tracking: ${(Array.isArray(trackingTypes) ? trackingTypes : []).join(', ')}\n` : '';

  if (p === 'vendor') {
    ctx += `Competitors: ${(workspace.competitors || workspace.competitors || []).join(', ')}\n`;
    ctx += `Wins on: ${workspace.winFactors || workspace.win_factors || 'not specified'}\n`;
    ctx += `Vulnerable on: ${workspace.vulnerability || 'not specified'}\n`;
    ctx += `FRAMING: Surface competitive and commercial implications. Flag threats to market position, deal flow, or product differentiation.\n`;
  } else if (p === 'business_owner') {
    ctx += `Competitors: ${(workspace.competitors || []).join(', ')}\n`;
    ctx += `Biggest risk: ${workspace.vulnerability || 'not specified'}\n`;
    ctx += `FRAMING: Frame insights in terms of business survival, growth, and competitive threat. Flag what requires a decision now vs what to monitor.\n`;
  } else if (p === 'government') {
    ctx += `Procurement frameworks: ${workspace.winFactors || workspace.win_factors || 'not specified'}\n`;
    ctx += `FRAMING: Frame insights in terms of procurement implications and policy impact. Do not use commercial competitive framing.\n`;
  } else if (p === 'analyst') {
    ctx += `Client audience: ${workspace.briefingAudience || workspace.briefing_audience || 'not specified'}\n`;
    ctx += `FRAMING: Frame insights as advisory intelligence. Highlight what a client would need to know to make a decision.\n`;
  } else if (p === 'sales') {
    ctx += `Competing against: ${(workspace.competitors || []).join(', ')}\n`;
    ctx += `Common objections: ${workspace.vulnerability || 'not specified'}\n`;
    ctx += `FRAMING: Flag signals that indicate buying intent, competitive displacement opportunities, or objection handling ammunition.\n`;
  } else if (p === 'legal_compliance') {
    ctx += `Regulations monitored: ${(workspace.regulationsMonitored || workspace.regulations_monitored || []).join(', ')}\n`;
    ctx += `Regulatory bodies: ${(workspace.regulatoryBodies || workspace.regulatory_bodies || []).join(', ')}\n`;
    ctx += `FRAMING: Frame insights in terms of compliance risk, enforcement exposure, and regulatory timeline.\n`;
  }

  if (Array.isArray(trackingTypes) && trackingTypes.includes('regulations')) {
    ctx += `Regulations tracked: ${(workspace.regulationsMonitored || workspace.regulations_monitored || []).join(', ')}\n`;
  }
  if (Array.isArray(trackingTypes) && trackingTypes.includes('standards')) {
    ctx += `Standards certified: ${(workspace.standardsCertified || workspace.standards_certified || []).join(', ')}\n`;
  }
  if (earlyWarning) {
    ctx += `HIGH PRIORITY — flag immediately if this occurs: ${earlyWarning}\n`;
  }

  ctx += `IMPORTANT: If an insight is not relevant to this customer's context, say so directly rather than forcing a connection.`;
  return ctx.trim();
}
