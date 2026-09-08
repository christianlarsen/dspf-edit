// @ts-check
import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';

// https://astro.build/config
export default defineConfig({
	site: 'https://christianlarsen.github.io',
	base: '/dspf-edit',
	integrations: [
		starlight({
			title: 'DSPF-edit',
			description: 'A live schema view, drag-and-drop screen preview, and deep DDS keyword coverage for editing IBM i display files in VS Code and IBM Bob.',
			logo: {
				src: './src/assets/dds-icon.svg',
			},
			social: [
				{ icon: 'github', label: 'GitHub', href: 'https://github.com/christianlarsen/dspf-edit' },
			],
			editLink: {
				baseUrl: 'https://github.com/christianlarsen/dspf-edit/edit/main/manual/',
			},
			customCss: [
				'./src/styles/custom.css',
			],
			sidebar: [
				{
					label: 'Home',
					link: '/',
				},
				{
					label: 'Install',
					link: '/install/',
				},
				{
					label: 'Quick Start',
					link: '/quickstart/',
					badge: {
						variant: 'note',
						text: 'Start Here!',
					},
				},
				{
					label: 'Help and Support',
					link: '/help-and-support/',
				},
				{
					label: 'Guides',
					items: [
						{ label: 'Schema Tree', link: '/guides/schema-tree/' },
						{ label: 'Screen Preview', link: '/guides/screen-preview/' },
						{ label: 'Records', link: '/guides/records/' },
						{ label: 'Fields', link: '/guides/fields/' },
						{ label: 'Constants', link: '/guides/constants/' },
						{ label: 'Indicators and Conditions', link: '/guides/indicators/' },
						{ label: 'Colors and Attributes', link: '/guides/colors-attributes/' },
						{ label: 'Command Keys', link: '/guides/command-keys/' },
						{ label: 'Windows', link: '/guides/windows/' },
						{ label: 'Subfiles', link: '/guides/subfiles/' },
						{ label: 'Multiple Display Sizes', link: '/guides/display-sizes/' },
						{ label: 'Referenced Fields', link: '/guides/referenced-fields/' },
						{ label: 'Configuration', link: '/guides/configuration/' },
					],
					collapsed: false,
				},
			],
		}),
	],
});
