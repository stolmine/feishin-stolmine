import { RiCheckLine, RiListUnordered, RiSortAsc, RiSortDesc } from 'react-icons/ri';

import { SortOption } from '/@/remote/utils/sort-options';
import { ActionIcon } from '/@/shared/components/action-icon/action-icon';
import { DropdownMenu } from '/@/shared/components/dropdown-menu/dropdown-menu';
import { SortOrder } from '/@/shared/types/domain-types';

export type SortControlOption = SortOption;

export interface SortControlValue {
    sortBy: string;
    sortOrder: SortOrder;
}

interface SortControlProps {
    onChange: (sort: SortControlValue) => void;
    options: SortControlOption[];
    sortBy: string;
    sortOrder: SortOrder;
}

export const SortControl = ({ onChange, options, sortBy, sortOrder }: SortControlProps) => {
    const handleSortByChange = (option: SortControlOption) => {
        if (option.value === sortBy) return;
        onChange({ sortBy: option.value, sortOrder: option.defaultOrder ?? sortOrder });
    };

    const handleToggleOrder = () => {
        onChange({
            sortBy,
            sortOrder: sortOrder === SortOrder.ASC ? SortOrder.DESC : SortOrder.ASC,
        });
    };

    return (
        <>
            <DropdownMenu position="bottom-end">
                <DropdownMenu.Target>
                    <ActionIcon aria-label="Sort by" variant="default">
                        <RiListUnordered size={20} />
                    </ActionIcon>
                </DropdownMenu.Target>
                <DropdownMenu.Dropdown>
                    {options.map((option) => (
                        <DropdownMenu.Item
                            isSelected={option.value === sortBy}
                            key={option.value}
                            onClick={() => handleSortByChange(option)}
                            rightSection={
                                option.value === sortBy ? <RiCheckLine size={16} /> : undefined
                            }
                        >
                            {option.label}
                        </DropdownMenu.Item>
                    ))}
                </DropdownMenu.Dropdown>
            </DropdownMenu>
            <ActionIcon
                aria-label={sortOrder === SortOrder.ASC ? 'Sort ascending' : 'Sort descending'}
                onClick={handleToggleOrder}
                variant="default"
            >
                {sortOrder === SortOrder.ASC ? <RiSortAsc size={20} /> : <RiSortDesc size={20} />}
            </ActionIcon>
        </>
    );
};
