/// <reference path="../index.d.ts" />

import NodePath from 'node:path';
import { resolve as resolveUrl } from 'node:url';
import type { PageIndexInfo, RspressPlugin, UserConfig } from '@rspress/core';
import { getIconUrlPath } from '@rspress/core';
import { Feed } from 'feed';

import { createFeed, generateFeedItem } from './createFeed';
import { PluginComponents, PluginName } from './exports';
import { concatArray, type ResolvedOutput, writeFile } from './internals';
import { getDefaultFeedOption, getOutputInfo, testPage } from './options';
import type { FeedChannel, FeedItem, PluginRssOptions } from './type';

type FeedItemWithChannel = FeedItem & { channel: string };
type TransformedFeedChannel = FeedChannel & { output: ResolvedOutput };

class FeedsSet {
  feeds: TransformedFeedChannel[] = [];
  feedsMapById: Record<string, TransformedFeedChannel> = Object.create(null);
  set({ feed, output, siteUrl }: PluginRssOptions, config: UserConfig) {
    this.feeds = (
      Array.isArray(feed) ? feed : [{ ...getDefaultFeedOption(), ...feed }]
    ).map(options => ({
      title: config.title || '',
      description: config.description || '',
      favicon: config.icon && resolveUrl(siteUrl, getIconUrlPath(config.icon)),
      copyright: config.themeConfig?.footer?.message || '',
      link: siteUrl,
      docs: '',
      ...options,
      output: getOutputInfo(options, { siteUrl, output }),
    }));

    this.feedsMapById = this.feeds.reduce(
      (m, f) => ({ ...m, [f.id]: f }),
      Object.create(null),
    );
  }
  get(): TransformedFeedChannel[];
  get(id: string): TransformedFeedChannel | null;
  get(id?: string): TransformedFeedChannel[] | TransformedFeedChannel | null {
    if (id) {
      return this.feedsMapById[id] || null;
    }
    return this.feeds.slice(0);
  }
}

function getRssItems(
  feeds: TransformedFeedChannel[],
  page: PageIndexInfo,
  siteUrl: string,
): Promise<FeedItemWithChannel[]> {
  return Promise.all(
    feeds
      .filter(options => testPage(options.test, page))
      .map(async options => {
        const after = options.item || ((feed: FeedItem) => feed);
        const item = await after(generateFeedItem(page, siteUrl), page);
        return { ...item, channel: options.id };
      }),
  );
}

export function pluginRss(pluginRssOptions: PluginRssOptions): RspressPlugin {
  const feedsSet = new FeedsSet();

  /**
   * workaround for retrieving data of pages in `afterBuild`
   * TODO: get pageData list directly in `afterBuild`
   **/
  let _rssWorkaround: null | Record<
    string,
    PromiseLike<FeedItemWithChannel[]>
  > = null;

  return {
    name: PluginName,
    globalUIComponents: Object.values(PluginComponents),
    beforeBuild(config, isProd) {
      if (!isProd) {
        _rssWorkaround = null;
        return;
      }
      _rssWorkaround = {};
      feedsSet.set(pluginRssOptions, config);
    },
    async extendPageData(pageData) {
      if (!_rssWorkaround) return;

      // rspress run `extendPageData` for each page
      //   - let's cache rss items within a complete rspress build
      _rssWorkaround[pageData.routePath] =
        _rssWorkaround[pageData.routePath] ||
        getRssItems(feedsSet.get(), pageData, pluginRssOptions.siteUrl);

      const feeds = await _rssWorkaround[pageData.routePath];
      const showRssList = new Set(
        concatArray(pageData.frontmatter['link-rss'] as string[] | string),
      );
      for (const feed of feeds) {
        showRssList.add(feed.channel);
      }

      pageData.feeds = Array.from(showRssList, id => {
        const { output, language } = feedsSet.get(id)!;
        return {
          url: output.url,
          mime: output.mime,
          language: language || pageData.lang,
        };
      });
    },
    async afterBuild(config) {
      if (!_rssWorkaround) return;

      const items = concatArray(
        ...(await Promise.all(Object.values(_rssWorkaround))),
      );
      const feeds: Record<string, Feed> = Object.create(null);

      for (const { channel, ...item } of items) {
        feeds[channel] =
          feeds[channel] ||
          new Feed(createFeed(feedsSet.get(channel)!, config));
        feeds[channel].addItem(item);
      }

      for (const [channel, feed] of Object.entries(feeds)) {
        const { output } = feedsSet.get(channel)!;
        feed.items.sort(output.sorting);
        const path = NodePath.resolve(
          config.outDir || 'doc_build',
          output.dir,
          output.filename,
        );
        await writeFile(path, output.getContent(feed));
      }
      _rssWorkaround = null;
    },
  };
}
