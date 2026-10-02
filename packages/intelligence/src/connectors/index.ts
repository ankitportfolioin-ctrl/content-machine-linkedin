export * from '../researchConnectors';
export * from './redditConnector';
export * from './youtubeConnector';
export * from './googleTrendsConnector';
export * from './linkedinConnector';
export * from './xConnector';
export * from './instagramConnector';
export * from './tiktokConnector';
export * from './facebookConnector';
export * from './quoraConnector';

import { connectorRegistry } from '../researchConnectors';
import { redditConnector } from './redditConnector';
import { youtubeConnector } from './youtubeConnector';
import { googleTrendsConnector } from './googleTrendsConnector';
import { linkedinConnector } from './linkedinConnector';
import { xConnector } from './xConnector';
import { instagramConnector } from './instagramConnector';
import { tiktokConnector } from './tiktokConnector';
import { facebookConnector } from './facebookConnector';
import { quoraConnector } from './quoraConnector';

// Register all connectors
connectorRegistry.register(redditConnector);
connectorRegistry.register(youtubeConnector);
connectorRegistry.register(googleTrendsConnector);
connectorRegistry.register(linkedinConnector);
connectorRegistry.register(xConnector);
connectorRegistry.register(instagramConnector);
connectorRegistry.register(tiktokConnector);
connectorRegistry.register(facebookConnector);
connectorRegistry.register(quoraConnector);

export { connectorRegistry };