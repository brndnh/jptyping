import { StatusBar } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';

import PracticeScreen from './src/screens/PracticeScreen';
import ResultsScreen from './src/screens/ResultsScreen.jsx';

const Stack = createNativeStackNavigator();

export default function App() {
  return (
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
      </Stack.Navigator>
    </NavigationContainer>
  );
}
