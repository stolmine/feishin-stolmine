import { memo, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { AutoDjFilterControls } from '/@/renderer/features/player/auto-dj/autodj-filter-controls';
import {
    SettingOption,
    SettingsSection,
} from '/@/renderer/features/settings/components/settings-section';
import {
    AUTO_DJ_MODE,
    AUTO_DJ_STRATEGY,
    type AutoDJStrategy,
    useAutoDJSettings,
    useSettingsStoreActions,
} from '/@/renderer/store/settings.store';
import { NumberInput } from '/@/shared/components/number-input/number-input';
import { SegmentedControl } from '/@/shared/components/segmented-control/segmented-control';
import { Select } from '/@/shared/components/select/select';
import { Slider } from '/@/shared/components/slider/slider';
import { Switch } from '/@/shared/components/switch/switch';
import { TextInput } from '/@/shared/components/text-input/text-input';

export const AutoDJSettings = memo(() => {
    const { t } = useTranslation();
    const settings = useAutoDJSettings();
    const { setSettings } = useSettingsStoreActions();
    const [showAdvanced, setShowAdvanced] = useState(false);

    const itemLabels = useMemo(() => {
        return {
            description: t('setting.autoDJ_itemCount_description'),
            title: t('setting.autoDJ_itemCount'),
        };
    }, [t]);

    const strategySelectData = useMemo(
        () => [
            {
                label: t('setting.autoDJ_strategy_option_similar'),
                value: AUTO_DJ_STRATEGY.SIMILAR,
            },
            {
                label: t('setting.autoDJ_strategy_option_library_random'),
                value: AUTO_DJ_STRATEGY.LIBRARY_RANDOM,
            },
            {
                label: 'Vector (self-hosted)',
                value: AUTO_DJ_STRATEGY.VECTOR,
            },
        ],
        [t],
    );

    const autoDJOptions: SettingOption[] = [
        {
            control: (
                <SegmentedControl
                    data={[
                        { label: t('setting.autoDJ_mode_songs'), value: AUTO_DJ_MODE.SONGS },
                        { label: t('setting.autoDJ_mode_albums'), value: AUTO_DJ_MODE.ALBUMS },
                    ]}
                    onChange={(value) => {
                        setSettings({
                            autoDJ: {
                                mode: value as 'albums' | 'songs',
                            },
                        });
                    }}
                    size="sm"
                    value={settings.mode}
                    w="100%"
                />
            ),
            description: t('setting.autoDJ_mode_description'),
            title: t('setting.autoDJ_mode'),
        },
        {
            control: (
                <Select
                    data={strategySelectData}
                    onChange={(value) =>
                        value &&
                        setSettings({
                            autoDJ: {
                                songStrategy: value as AutoDJStrategy,
                            },
                        })
                    }
                    value={settings.songStrategy ?? AUTO_DJ_STRATEGY.SIMILAR}
                    w="100%"
                />
            ),
            description: '',
            title: t('setting.autoDJ_songStrategy'),
        },
        {
            control: (
                <Select
                    data={strategySelectData}
                    onChange={(value) =>
                        value &&
                        setSettings({
                            autoDJ: {
                                albumStrategy: value as AutoDJStrategy,
                            },
                        })
                    }
                    value={settings.albumStrategy ?? AUTO_DJ_STRATEGY.SIMILAR}
                    w="100%"
                />
            ),
            description: '',
            title: t('setting.autoDJ_albumStrategy'),
        },
        {
            control: (
                <NumberInput
                    aria-label={itemLabels.title}
                    hideControls={false}
                    max={50}
                    min={1}
                    onChange={(e) => {
                        setSettings({
                            autoDJ: {
                                itemCount: Number(e),
                            },
                        });
                    }}
                    value={Number(settings.itemCount)}
                />
            ),
            description: itemLabels.description,
            title: itemLabels.title,
        },
        {
            control: (
                <NumberInput
                    aria-label="Auto DJ timing"
                    hideControls={false}
                    max={5}
                    min={1}
                    onChange={(e) => {
                        setSettings({
                            autoDJ: {
                                timing: Number(e),
                            },
                        });
                    }}
                    value={Number(settings.timing)}
                />
            ),
            description: t('setting.autoDJ_timing', {
                context: 'description',
            }),
            title: t('setting.autoDJ_timing'),
        },
        {
            control: (
                <Switch
                    aria-label={t('setting.autoDJ_allowDuplicates')}
                    checked={settings.allowDuplicates}
                    onChange={(e) => {
                        setSettings({
                            autoDJ: {
                                allowDuplicates: e.currentTarget.checked,
                            },
                        });
                    }}
                />
            ),
            description: t('setting.autoDJ_allowDuplicates_description'),
            title: t('setting.autoDJ_allowDuplicates'),
        },
        {
            control: (
                <Switch
                    aria-label={t('setting.autoDJ_onlySimilar')}
                    checked={settings.onlySimilar}
                    onChange={(e) => {
                        setSettings({
                            autoDJ: {
                                onlySimilar: e.currentTarget.checked,
                            },
                        });
                    }}
                />
            ),
            description: t('setting.autoDJ_onlySimilar_description'),
            title: t('setting.autoDJ_onlySimilar'),
        },
    ];

    // Vector-strategy-only controls (self-hosted recommender). Surfaced here for now;
    // the dedicated AutoDJ session page + parameter modal land in a later pass.
    if (settings.songStrategy === AUTO_DJ_STRATEGY.VECTOR) {
        autoDJOptions.push(
            {
                control: (
                    <TextInput
                        aria-label="Recommender URL"
                        onChange={(e) =>
                            setSettings({
                                autoDJ: { recommenderUrl: e.currentTarget.value },
                            })
                        }
                        placeholder="http://host:8001"
                        value={settings.recommenderUrl}
                        w="100%"
                    />
                ),
                description: 'Base URL of the self-hosted AutoDJ recommender',
                title: 'Recommender URL',
            },
            {
                control: (
                    <Slider
                        aria-label="Contrast"
                        defaultValue={settings.contrast}
                        label={(value) => value.toFixed(2)}
                        max={1}
                        min={0}
                        onChangeEnd={(value) =>
                            setSettings({
                                autoDJ: { contrast: value },
                            })
                        }
                        step={0.05}
                        w={220}
                    />
                ),
                description: '0 = consistency (hug the vibe) · 1 = maximum variety',
                title: 'Contrast',
            },
            {
                control: (
                    <Switch
                        aria-label="Advanced filters"
                        checked={showAdvanced}
                        onChange={(e) => setShowAdvanced(e.currentTarget.checked)}
                    />
                ),
                description: 'Filter the candidate pool by year, genre, tempo, length, artist',
                title: 'Advanced filters',
            },
        );
    }

    const showFilters = settings.songStrategy === AUTO_DJ_STRATEGY.VECTOR && showAdvanced;

    return (
        <SettingsSection
            extra={showFilters ? <AutoDjFilterControls /> : undefined}
            options={autoDJOptions}
            title={t('setting.autoDJ')}
        />
    );
});
