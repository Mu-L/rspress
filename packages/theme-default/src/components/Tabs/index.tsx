import {
  Children,
  type ComponentPropsWithRef,
  type ForwardedRef,
  forwardRef,
  isValidElement,
  type ReactElement,
  type ReactNode,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { TabDataContext } from '../../logic/TabDataContext';
import { useStorageValue } from '../../logic/useStorageValue';
import * as styles from './index.module.scss';

type TabItem = {
  value?: string;
  label?: string | ReactNode;
  disabled?: boolean;
};

interface TabsProps {
  values?: ReactNode[] | ReadonlyArray<ReactNode> | TabItem[];
  defaultValue?: string;
  onChange?: (index: number) => void;
  children: ReactNode;
  groupId?: string;
  tabContainerClassName?: string;
  tabPosition?: 'left' | 'center';
}

function isTabItem(item: unknown): item is TabItem {
  if (item && typeof item === 'object' && 'label' in item) {
    return true;
  }
  return false;
}

const renderTab = (item: ReactNode | TabItem) => {
  if (isTabItem(item)) {
    return item.label || item.value;
  }
  return item;
};

export const groupIdPrefix = 'rspress.tabs.';

export const Tabs = forwardRef(
  (props: TabsProps, ref: ForwardedRef<HTMLDivElement>): ReactElement => {
    const {
      values,
      defaultValue,
      onChange,
      children: rawChildren,
      groupId,
      tabPosition = 'left',
      tabContainerClassName,
    } = props;
    // remove "\n" character when write JSX element in multiple lines, use Children.toArray for Tabs with no Tab element
    const children = Children.toArray(rawChildren).filter(
      child => !(typeof child === 'string' && child.trim() === ''),
    ) as unknown as ReactElement<TabProps>[];

    let tabValues = values || [];

    if (tabValues.length === 0) {
      tabValues = Children.map<TabItem, ReactElement<TabProps>>(
        children,
        child => {
          if (isValidElement(child)) {
            return {
              label: child.props?.label || undefined,
              value:
                child.props?.value ||
                (child.props?.label as string) ||
                undefined,
            };
          }

          return {
            label: undefined,
            value: undefined,
          };
        },
      );
    }

    const { tabData, setTabData } = useContext(TabDataContext);
    const [activeIndex, setActiveIndex] = useState(() => {
      if (defaultValue === undefined) {
        return 0;
      }

      return tabValues.findIndex(item => {
        if (typeof item === 'string') {
          return item === defaultValue;
        }
        if (item && typeof item === 'object' && 'value' in item) {
          return item.value === defaultValue;
        }
        return false;
      });
    });

    const [storageIndex, setStorageIndex] = useStorageValue<string>(
      `${groupIdPrefix}${groupId}`,
      activeIndex.toString(),
    );

    const syncIndex = useMemo(() => {
      if (groupId) {
        if (tabData[groupId] !== undefined) {
          return tabData[groupId];
        }

        return Number.parseInt(storageIndex);
      }

      return activeIndex;
    }, [groupId && tabData[groupId]]);

    // sync when other browser page trigger update
    useEffect(() => {
      if (groupId) {
        const correctIndex = Number.parseInt(storageIndex);

        if (syncIndex !== correctIndex) {
          setTabData({ ...tabData, [groupId]: correctIndex });
        }
      }
    }, [storageIndex]);

    const currentIndex = groupId ? syncIndex : activeIndex;

    return (
      <div className={styles.container} ref={ref}>
        <div className={tabContainerClassName}>
          {tabValues.length ? (
            <div
              className={`${styles.tabList} ${styles.noScrollbar}`}
              style={{
                justifyContent:
                  tabPosition === 'center' ? 'center' : 'flex-start',
              }}
            >
              {tabValues.map((item, index) => {
                return (
                  <div
                    // eslint-disable-next-line react/no-array-index-key
                    key={index}
                    className={`${styles.tab} ${
                      currentIndex === index
                        ? styles.selected
                        : styles.notSelected
                    }`}
                    onClick={() => {
                      onChange?.(index);
                      if (groupId) {
                        setTabData({ ...tabData, [groupId]: index });
                        setStorageIndex(index.toString());
                      } else {
                        setActiveIndex(index);
                      }
                    }}
                  >
                    {renderTab(item)}
                  </div>
                );
              })}
            </div>
          ) : null}
        </div>
        <div>{Children.toArray(children)[currentIndex]}</div>
      </div>
    );
  },
);

export type TabProps = ComponentPropsWithRef<'div'> &
  Pick<TabItem, 'label' | 'value'>;

export function Tab({ children, ...props }: TabProps): ReactElement {
  return (
    <div {...props} className="rp-rounded rp-px-2">
      {children}
    </div>
  );
}
