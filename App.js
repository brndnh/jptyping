import 'react-native-gesture-handler';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaView, View } from 'react-native';
import PracticeScreen from './src/screens/PracticeScreen';

export default function App() {
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#0f1115' }}>
      <StatusBar style="light" />
      <View style={{ flex: 1 }}>
        <PracticeScreen />
      </View>
    </SafeAreaView>
  );
}
