// src/storage/lastSet.js
import AsyncStorage from '@react-native-async-storage/async-storage';
const KEY = 'lastSetId';
export const saveLastSet = (id) => AsyncStorage.setItem(KEY, id);
export const loadLastSet = async (fallback) => (await AsyncStorage.getItem(KEY)) || fallback;
