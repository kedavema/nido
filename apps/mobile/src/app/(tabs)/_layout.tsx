import { Ionicons } from '@expo/vector-icons';
import { Tabs } from 'expo-router';
import { StyleSheet, View, type ColorValue } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { TAB_DEFINITIONS, type TabDefinition } from '@/navigation/tabs';
import { themeTokens } from '@/theme/tokens';

interface TabBarIconProps {
  readonly color: ColorValue;
  readonly focused: boolean;
  readonly tab: TabDefinition;
}

function TabBarIcon({ color, focused, tab }: TabBarIconProps) {
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[styles.iconPill, focused && styles.activeIconPill]}
    >
      <Ionicons color={color} name={focused ? tab.activeIcon : tab.icon} size={22} />
    </View>
  );
}

export default function TabLayout() {
  const insets = useSafeAreaInsets();

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: themeTokens.colors.primary,
        tabBarInactiveTintColor: themeTokens.colors.tabInactive,
        tabBarShowLabel: true,
        tabBarHideOnKeyboard: false,
        tabBarStyle: {
          height: 64 + insets.bottom,
          paddingTop: themeTokens.spacing.base,
          paddingBottom: Math.max(insets.bottom, themeTokens.spacing.base),
          borderTopColor: themeTokens.colors.border,
          borderTopWidth: 1,
          backgroundColor: themeTokens.colors.surface,
          elevation: 0,
          shadowOpacity: 0,
        },
        tabBarItemStyle: {
          minHeight: themeTokens.touchTarget.minimum,
        },
        tabBarLabelStyle: {
          marginTop: 2,
          fontFamily: themeTokens.typography.families.bodyMedium,
          fontSize: themeTokens.typography.scale.label,
          lineHeight: 13,
        },
      }}
    >
      {TAB_DEFINITIONS.map((tab) => (
        <Tabs.Screen
          key={tab.route}
          name={tab.route}
          options={{
            title: tab.label,
            tabBarAccessibilityLabel: tab.label,
            tabBarIcon: ({ color, focused }) => (
              <TabBarIcon color={color} focused={focused} tab={tab} />
            ),
          }}
        />
      ))}
    </Tabs>
  );
}

const styles = StyleSheet.create({
  iconPill: {
    width: 52,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: themeTokens.radii.chip,
  },
  activeIconPill: {
    backgroundColor: themeTokens.colors.primaryTint,
  },
});
