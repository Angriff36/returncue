import { MetadataRoute } from 'next';

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    { url: 'https://returncue.app', lastModified: new Date(), changeFrequency: 'weekly', priority: 1 },
    { url: 'https://returncue.app/auth/signin', lastModified: new Date(), changeFrequency: 'monthly', priority: 0.5 },
    { url: 'https://returncue.app/auth/signup', lastModified: new Date(), changeFrequency: 'monthly', priority: 0.5 },
  ];
}
