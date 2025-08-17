import { StatusBar } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { SettingsProvider } from './src/state/SettingsContext';


import PracticeScreen from './src/screens/PracticeScreen';
import ResultsScreen from './src/screens/ResultsScreen.jsx';
import SettingsScreen from './src/screens/SettingsScreen';

const Stack = createNativeStackNavigator();

export default function App() {
  return (
    <SettingsProvider>
      <NavigationContainer>
        <StatusBar barStyle="light-content" />
        <Stack.Navigator
          screenOptions={{
            headerStyle: { backgroundColor: '#0f1115' },
            headerTintColor: '#c9d1d9',
            contentStyle: { backgroundColor: '#0f1115' },
          }}
        >
          <Stack.Screen name="Practice" component={PracticeScreen} options={{ title: 'Practice' }} />
          <Stack.Screen name="Results" component={ResultsScreen} options={{ title: 'Results' }} />
          <Stack.Screen name="Settings" component={SettingsScreen} options={{ title: 'Settings' }} />
        </Stack.Navigator>
      </NavigationContainer>
    </SettingsProvider>
  );
}
