import React from 'react';
import { ActivityIndicator, Platform, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../theme/ThemeContext';
import type { WelcomeQuote } from '../services/api/welcomeApi';

export default function WelcomeCard({ quote, onEnter, onNext, onSettings, preview=false, busy=false, error='' }: {
  quote: WelcomeQuote; onEnter: () => void; onNext?: () => void; onSettings?: () => void;
  preview?: boolean; busy?: boolean; error?: string;
}) {
  const { theme }=useTheme(); const dark=theme.key==='dark'; const insets=useSafeAreaInsets();
  const ink=dark?'#f2e8f6':'#40344f'; const muted=dark?'#c2b5d0':'#75617d';
  const now=new Date();
  return <LinearGradient colors={dark?['#543749','#393255','#223d58']:['#ffe1d1','#f7d9e8','#e2ddff','#c9e4f3']} style={styles.page}>
    <View pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={StyleSheet.absoluteFill}>
      <View style={[styles.orbit,{top:insets.top+64}]} />
      <LinearGradient colors={dark?['#dba685','#b5707c']:['#fff1bc','#ffb88e']} style={[styles.sun,{top:insets.top+90}]} />
      <Text style={[styles.star,{top:insets.top+118}]}>✦</Text>
      <View style={[styles.hill,styles.far,{backgroundColor:dark?'#514875':'#b4b8ec'}]} />
      <View style={[styles.hill,styles.middle,{backgroundColor:dark?'#34566b':'#92c6da'}]} />
      <View style={[styles.hill,styles.near,{backgroundColor:dark?'#484565':'#d4d3f4'}]} />
    </View>
    <ScrollView contentContainerStyle={[styles.content,{paddingTop:preview?20:insets.top+18,paddingBottom:insets.bottom+18}]}>
      <View style={styles.header}>
        <View style={styles.brand}><Text style={styles.logo}>bb</Text><Text style={[styles.brandName,{color:ink}]}>BBTalk</Text></View>
        <View><Text style={[styles.date,{color:ink}]}>{preview?'扉页预览':now.toLocaleDateString('zh-CN',{month:'long',day:'numeric'})}</Text>
          {!preview&&<Text style={[styles.weekday,{color:muted}]}>{now.toLocaleDateString('zh-CN',{weekday:'long'})}</Text>}</View>
      </View>
      <View style={styles.reading}>
        <View style={[styles.card,{backgroundColor:dark?'rgba(48,42,67,0.96)':'rgba(255,251,249,0.94)',borderColor:dark?'#776786':'#fff'}]}>
          <Text accessibilityRole="header" style={[styles.title,{color:muted}]}>写在今天之前</Text>
          <Text accessible={false} style={styles.quoteMark}>“</Text>
          <Text accessibilityLiveRegion="polite" selectable style={[styles.quote,{color:ink},quote.text.length>160&&styles.longQuote]}>{quote.text}</Text>
          {!!quote.source&&<Text style={[styles.source,{color:muted}]}>—  {quote.source}</Text>}
          <View accessible={false} style={styles.colors}><View style={[styles.stroke,{backgroundColor:'#f3b39a',width:23}]} /><View style={[styles.stroke,{backgroundColor:'#bcb1e7',width:15}]} /><View style={[styles.stroke,{backgroundColor:'#9bcdd6',width:9}]} /></View>
        </View>
        {!!error&&<Text accessibilityRole="alert" style={[styles.error,{color:dark?'#ffcabd':'#902c31'}]}>{error}</Text>}
        <View style={styles.actions}>
          <TouchableOpacity accessibilityRole="button" onPress={onEnter} style={[styles.button,styles.primary]}><Text style={styles.primaryText}>{preview?'返回文案设置':'进入记录'}</Text><Ionicons name="arrow-forward" size={20} color="#fff" /></TouchableOpacity>
          {onNext&&<TouchableOpacity accessibilityRole="button" accessibilityLabel="换一句" accessibilityState={{disabled:busy,busy}} disabled={busy} onPress={onNext} style={[styles.button,styles.secondary,{backgroundColor:dark?'#403750':'rgba(255,251,255,0.8)'}]}>
            {busy?<ActivityIndicator color={muted} />:<Ionicons name="refresh" size={20} color={muted} />}<Text style={{color:ink,fontSize:16}}>换一句</Text>
          </TouchableOpacity>}
        </View>
      </View>
      <View style={styles.footer}><Text style={{color:ink,fontSize:12}}>留一句话，给此刻的自己。</Text>
        {onSettings&&<TouchableOpacity accessibilityRole="button" onPress={onSettings} style={styles.manage}><Ionicons name="create-outline" size={16} color={ink} /><Text style={{color:ink,fontSize:13}}>管理我的文案</Text></TouchableOpacity>}
      </View>
    </ScrollView>
  </LinearGradient>;
}
const styles=StyleSheet.create({
  page:{flex:1,overflow:'hidden'},content:{flexGrow:1,paddingHorizontal:22},header:{flexDirection:'row',alignItems:'flex-start',justifyContent:'space-between',gap:12},
  brand:{flexDirection:'row',alignItems:'center',gap:10},logo:{backgroundColor:'#f38769',color:'#fff',fontFamily:'Georgia',fontSize:23,fontWeight:'700',paddingHorizontal:8,paddingVertical:5,borderRadius:11,overflow:'hidden'},brandName:{fontSize:20,fontWeight:'700'},date:{fontSize:14,textAlign:'right'},weekday:{fontSize:12,marginTop:7,textAlign:'right'},
  sun:{position:'absolute',right:25,width:112,height:112,borderRadius:56},orbit:{position:'absolute',right:0,width:168,height:168,borderRadius:84,borderWidth:1,borderColor:'#ffffff80'},star:{position:'absolute',left:46,color:'#fff9ed',fontSize:28},
  hill:{position:'absolute',width:'155%',height:260,borderRadius:150},far:{bottom:80,right:-120,transform:[{rotate:'-20deg'}]},middle:{bottom:-80,left:-100,transform:[{rotate:'-20deg'}]},near:{bottom:-190,right:-120,transform:[{rotate:'-25deg'}]},
  reading:{width:'100%',maxWidth:640,alignSelf:'center',paddingTop:100,paddingBottom:52,flexGrow:1,justifyContent:'center'},card:{padding:26,borderRadius:24,borderWidth:1,shadowColor:'#62529c',shadowOpacity:0.12,shadowRadius:24,shadowOffset:{width:0,height:12}},title:{fontSize:13},quoteMark:{fontFamily:'Georgia',fontSize:80,lineHeight:84,height:67,color:'#e99d86',marginTop:15},quote:{fontSize:30,lineHeight:49,fontFamily:Platform.OS==='ios'?'Songti SC':'serif',minHeight:90},longQuote:{fontSize:21,lineHeight:36},source:{fontSize:13,lineHeight:21,marginTop:24},colors:{flexDirection:'row',gap:5,marginTop:30},stroke:{height:4,borderRadius:3},
  actions:{flexDirection:'row',flexWrap:'wrap',gap:12,marginTop:22},button:{minHeight:54,borderRadius:16,paddingVertical:14,paddingHorizontal:17,flexDirection:'row',alignItems:'center',justifyContent:'center',gap:9},primary:{backgroundColor:'#7656c3',flexGrow:1},primaryText:{color:'#fff',fontSize:17,fontWeight:'600'},secondary:{flexShrink:0},error:{fontSize:13,lineHeight:21,marginTop:14},footer:{alignItems:'center',gap:6},manage:{minHeight:44,flexDirection:'row',alignItems:'center',gap:6},
});
